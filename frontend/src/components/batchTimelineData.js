// frontend/src/components/batchTimelineData.js
//
// Non-component pieces shared by BatchTimeline.jsx and BatchHistory.jsx
// — split into their own plain-JS module (rather than living inside
// BatchTimeline.jsx alongside its components) because Vite's Fast
// Refresh only works cleanly when a file exports EITHER components OR
// plain values/hooks, not a mix of both.

import { useEffect, useState } from "react";
import { getReadOnlyContract, getProvider } from "../contract";
import { getUserByAddress } from "../api";

export const DELIVERY_STATUS_LABELS = ["Pending", "Delivered", "Not Delivered"];

/**
 * Given a resolved numeric batch id, fetches the batch's meta info
 * (manufacture/expiry dates, delivery status, rating) and its full
 * event timeline (registration, transfers, delivery updates, ratings),
 * resolving every address involved to a username/role/city.
 *
 * Pass null/undefined/"" to skip fetching (e.g. before a list row has
 * been clicked yet) — the hook just returns its idle state.
 */
export function useBatchTimeline(batchId) {
  const [state, setState] = useState({
    loading: false,
    error: "",
    batchCodeLabel: "",
    batchMeta: null,
    events: [],
    resolved: {},
  });

  useEffect(() => {
    let cancelled = false;

    if (batchId === null || batchId === undefined || batchId === "") {
      // Reset asynchronously (not during the effect body itself) so we
      // never call setState synchronously inside the effect — matches
      // the pattern used elsewhere in this app (see Dashboard's
      // refreshBalance effect).
      Promise.resolve().then(() => {
        if (!cancelled) {
          setState({ loading: false, error: "", batchCodeLabel: "", batchMeta: null, events: [], resolved: {} });
        }
      });
      return () => {
        cancelled = true;
      };
    }

    async function load() {
      setState((s) => ({ ...s, loading: true, error: "" }));
      try {
        const contract = getReadOnlyContract();
        const provider = getProvider();

        const batchData = await contract.getBatch(batchId);
        if (batchData.id.toString() === "0") {
          throw new Error("That batch code / ID does not exist.");
        }

        const ratingCount = Number(batchData.ratingCount);
        const ratingSum = Number(batchData.ratingSum);
        const batchMeta = {
          manufactureDate: batchData.manufactureDate.toString(),
          expiryDate: batchData.expiryDate.toString(),
          deliveryStatus: Number(batchData.deliveryStatus),
          ratingCount,
          averageRating: ratingCount > 0 ? ratingSum / ratingCount : null,
        };

        const [registeredLogs, transferredLogs, deliveryLogs, ratingLogs] = await Promise.all([
          contract.queryFilter(contract.filters.BatchRegistered(), 0, "latest"),
          contract.queryFilter(contract.filters.OwnershipTransferred(), 0, "latest"),
          contract.queryFilter(contract.filters.DeliveryStatusUpdated(), 0, "latest"),
          contract.queryFilter(contract.filters.RatingSubmitted(), 0, "latest"),
        ]);

        const relevant = [...registeredLogs, ...transferredLogs, ...deliveryLogs, ...ratingLogs].filter(
          (log) => log.args.id.toString() === batchId.toString()
        );

        const withBlocks = await Promise.all(
          relevant.map(async (log) => {
            const block = await provider.getBlock(log.blockNumber);
            return {
              type: log.eventName, // BatchRegistered | OwnershipTransferred | DeliveryStatusUpdated | RatingSubmitted
              from: log.args.from ?? null,
              to: log.args.to ?? log.args.owner ?? log.args.pharmacy ?? null,
              status: log.args.status !== undefined ? Number(log.args.status) : null,
              rating: log.args.rating !== undefined ? Number(log.args.rating) : null,
              name: log.args.name ?? null,
              city: log.args.city ?? null,
              feedback: log.args.feedback ?? null,
              txHash: log.transactionHash,
              blockNumber: log.blockNumber,
              timestamp: block.timestamp,
            };
          })
        );
        withBlocks.sort((a, b) => a.blockNumber - b.blockNumber);

        const uniqueAddresses = [...new Set(withBlocks.flatMap((e) => [e.from, e.to]).filter(Boolean))];
        const lookups = await Promise.all(
          uniqueAddresses.map(async (addr) => [addr.toLowerCase(), await getUserByAddress(addr)])
        );
        const resolved = Object.fromEntries(lookups.filter(([, u]) => u !== null));

        if (!cancelled) {
          setState({
            loading: false,
            error: "",
            batchCodeLabel: batchData.batchCode,
            batchMeta,
            events: withBlocks,
            resolved,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            loading: false,
            error: err.message || "Failed to load history. Check the batch code/ID and try again.",
            batchCodeLabel: "",
            batchMeta: null,
            events: [],
            resolved: {},
          });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [batchId]);

  return state;
}
