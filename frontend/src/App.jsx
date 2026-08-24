import { useState, useEffect } from "react";
import {
  getMetaMaskContract,
  getReadOnlyContract,
  getProvider,
  getBalance,
  isChainReachable,
  requestMetaMaskAccountSelection,
  getCurrentlyConnectedAccount,
  isMetaMaskOnCorrectNetwork,
  switchMetaMaskToLocalNetwork,
  isMetaMaskAvailable,
} from "./contract";
import {
  signup,
  login,
  adminLogin,
  listAllUsers,
  getUserByAddress,
  requestFaucet,
  revealPrivateKey,
  rateBatch,
  verifyForgotPasswordAnswers,
  resetPasswordWithToken,
  adminSetAccountStatus,
} from "./api";
import { formatUser } from "./participants";
import { INDIAN_CITIES } from "./cities";
import { SPORTS, INDIAN_FOODS } from "./sportsAndFoods";
import UserSearchSelect from "./components/UserSearchSelect";
import BatchHistory from "./components/BatchHistory";
import BatchTimelineView from "./components/BatchTimeline";
import ConfirmAndSign from "./components/ConfirmAndSign";
import ImportWalletModal from "./components/ImportWalletModal";
import BatchCodeInput from "./components/BatchCodeInput";
import QRCodeBox from "./components/QRCodeBox";

// NEW: sidebar navigation per role on the owner dashboard. Manufacturer
// gets Register Batch (their own page, since only they can register);
// Transporter/Distributor get Ownership Transfer (their equivalent
// "main" page, since they can't register); Pharmacy gets My Batches
// (delivered/not-delivered instead of a transfer form, since a Pharmacy
// is the end of the chain and marks delivery status instead of
// transferring onward). Fetch Batch (look up any batch by code) is
// available to every role.
const NAV_ITEMS = {
  Manufacturer: [
    { key: "register", label: "Register Batch" },
    { key: "registered", label: "Registered Batches" },
    { key: "transfer", label: "Ownership Transfer" },
    { key: "fetch", label: "Batch History" },
  ],
  Transporter: [
    { key: "transfer", label: "Ownership Transfer" },
    { key: "fetch", label: "Batch History" },
  ],
  Distributor: [
    { key: "transfer", label: "Ownership Transfer" },
    { key: "fetch", label: "Batch History" },
  ],
  Pharmacy: [
    { key: "deliveries", label: "My Batches" },
    { key: "fetch", label: "Batch History" },
  ],
};

// CHANGED: replaced colorful emoji with simple monochrome line-icon SVGs
// (using currentColor, so they pick up the button's text color) — matches
// WhatsApp's flat, professional icon style instead of emoji.
function HomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10h14V10" />
    </svg>
  );
}
function DocumentIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M9 13h6M9 17h6" />
    </svg>
  );
}
function ArchiveIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
      <path d="M10 13h4" />
    </svg>
  );
}
function SwapIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3l4 4-4 4" />
      <path d="M3 7h8" />
      <path d="M17 21l-4-4 4-4" />
      <path d="M21 17h-8" />
    </svg>
  );
}
function HistoryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v6h6" />
      <path d="M3.5 9a9 9 0 1 0 2-5.5L3 9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}
function PillIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="10" width="18" height="6" rx="3" transform="rotate(-45 12 12)" />
      <path d="M8.5 8.5l7 7" />
    </svg>
  );
}

const NAV_ICONS = {
  register: DocumentIcon,
  registered: ArchiveIcon,
  transfer: SwapIcon,
  fetch: HistoryIcon,
  deliveries: PillIcon,
};

// CHANGED: "Consumer" and "Wholesaler" are no longer sign-up roles.
// A consumer never creates an account at all — see ConsumerVerify below,
// a public verify/rate flow that needs no login and no MetaMask.
// "Wholesaler" was replaced with "Transporter", moved to right after the
// Manufacturer in the chain.
const ROLES = ["Manufacturer", "Transporter", "Distributor", "Pharmacy"];
const LOW_BALANCE_THRESHOLD_ETH = 1;

// NEW: enforces the real supply-chain order in the UI, matching what
// SupplyChain.sol now enforces on-chain (Manufacturer -> Transporter ->
// Distributor -> Pharmacy). A Manufacturer's recipient picker only shows
// Transporters, a Transporter's only shows Distributors, etc. Pharmacy
// isn't in this map at all — they mark delivery status instead of
// transferring onward (see PharmacyBatchesPanel).
const NEXT_ROLE = {
  Manufacturer: "Transporter",
  Transporter: "Distributor",
  Distributor: "Pharmacy",
};

const DELIVERY_STATUS_LABELS = ["Pending", "Delivered", "Not Delivered"];

// Password rule shown to the user and checked before submitting — the
// backend enforces the same rule again, so this is just fast feedback.
const PASSWORD_REGEX = /^(?=.*[0-9])(?=.*[a-z])(?=.*[A-Z])(?=.*[@$])[A-Za-z0-9@$]{8,}$/;
const PASSWORD_HINT =
  "At least 8 characters, including a number, an uppercase letter, a lowercase letter, and @ or $.";

function formatBlockchainTime(unixSeconds) {
  if (!unixSeconds) return "—";
  const d = new Date(Number(unixSeconds) * 1000);
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`;
}

function MessageBox({ message }) {
  if (!message || !message.text) return null;
  const colors = {
    success: { bg: "#052e16", border: "#16a34a", text: "#86efac" },
    error: { bg: "#450a0a", border: "#dc2626", text: "#fca5a5" },
    pending: { bg: "#1e1b4b", border: "#6c2bd9", text: "#c4b5fd" },
  };
  const style = colors[message.type] || colors.pending;
  return (
    <div
      style={{
        marginTop: "12px",
        padding: "10px 14px",
        borderRadius: "8px",
        backgroundColor: style.bg,
        border: `1px solid ${style.border}`,
        color: style.text,
        fontSize: "14px",
      }}
    >
      {message.text}
    </div>
  );
}

function describeError(err) {
  const raw = (
    err?.reason ||
    err?.shortMessage ||
    err?.info?.error?.message ||
    err?.message ||
    ""
  ).toLowerCase();
  if (raw.includes("user rejected") || err?.code === 4001 || err?.code === "ACTION_REJECTED") {
    return "Transaction cancelled in MetaMask.";
  }
  if (raw.includes("metamask is not installed")) return err.message;
  if (raw.includes("only the current owner")) return "Only the current owner can transfer this batch.";
  if (raw.includes("only a manufacturer")) return "Only a Manufacturer can register a batch.";
  if (raw.includes("can only transfer to a transporter")) return "A Manufacturer can only transfer ownership to a Transporter.";
  if (raw.includes("can only transfer to a distributor")) return "A Transporter can only transfer ownership to a Distributor.";
  if (raw.includes("can only transfer to a pharmacy")) return "A Distributor can only transfer ownership to a Pharmacy.";
  if (raw.includes("not permitted to transfer")) return "This role is not permitted to transfer ownership. Use Mark Delivered instead.";
  if (raw.includes("only a pharmacy can update delivery")) return "Only a Pharmacy can update delivery status.";
  if (raw.includes("expiry date must be after")) return "Expiry date must be after the manufacture date.";
  if (raw.includes("batch code already exists")) return "That batch code is already in use. Choose a unique batch code.";
  if (raw.includes("batch code cannot be empty")) return "Batch code cannot be empty.";
  if (raw.includes("batch does not exist")) return "That batch code / ID does not exist.";
  if (raw.includes("rating must be between")) return "Rating must be a whole number from 1 to 5.";
  if (raw.includes("insufficient funds")) return 'Insufficient local ETH for gas. Use "Add 10 Test ETH" above.';
  if (raw.includes("invalid new owner")) return "Invalid recipient wallet address.";
  if (raw.includes("cannot reach")) return err.message;
  return err?.reason || err?.shortMessage || err?.message || "Something went wrong.";
}

// Convert an <input type="date"> value ("YYYY-MM-DD") to a Unix
// timestamp (seconds), the same representation the contract stores
// createdAt/manufactureDate/expiryDate in.
function dateStringToUnix(dateStr) {
  if (!dateStr) return 0;
  return Math.floor(new Date(dateStr + "T00:00:00").getTime() / 1000);
}

function formatDateOnly(unixSeconds) {
  if (!unixSeconds || Number(unixSeconds) === 0) return "—";
  const d = new Date(Number(unixSeconds) * 1000);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function App() {
  // "landing" | "admin-login" | "admin-dashboard" | "owner-auth" |
  // "dashboard" | "consumer-verify"
  const [view, setView] = useState("landing");
  const [chainOk, setChainOk] = useState(null);
  // Holds { username, role, city, walletAddress, privateKey } for the
  // logged-in owner participant, for the lifetime of this browser tab.
  // NOT persisted anywhere (no localStorage) — refreshing the page logs
  // the user out, which is the safer default for a private key in memory.
  const [session, setSession] = useState(null);
  // NEW: kept in memory only for the admin's session, so AdminDashboard
  // can call the enable/disable endpoint without re-prompting for the
  // admin password on every click. Same trust boundary as the rest of
  // this app's simple auth — no persistent token exists anywhere else.
  const [adminPassword, setAdminPassword] = useState(null);

  useEffect(() => {
    isChainReachable().then(setChainOk);
  }, []);

  const handleLoggedIn = (data) => {
    setSession(data);
    setView("dashboard");
  };

  const handleLogout = () => {
    setSession(null);
    setAdminPassword(null);
    setView("landing");
  };

  return (
    <>
      {(view === "landing" ||
        view === "admin-login" ||
        view === "admin-dashboard" ||
        view === "owner-auth" ||
        view === "forgot-password" ||
        view === "consumer-verify") && <HeroBackdrop />}
      <div style={view === "dashboard" ? dashboardPageStyle : pageStyle}>
        {view !== "landing" && view !== "owner-auth" && <h1 style={titleStyle}>Pharmaceutical Supply Chain App</h1>}

        {chainOk === false && (
          <div style={{ ...cardStyle, borderColor: "#dc2626", color: "#fca5a5" }}>
            Cannot reach the local blockchain at 127.0.0.1:8545. Run <code>npx hardhat node</code> in the
            blockchain folder, then reload this page.
          </div>
        )}

        {view === "landing" && <Landing onChoose={setView} />}
        {view === "admin-login" && (
          <AdminLogin
            onBack={() => setView("landing")}
            onSuccess={(pwd) => {
              setAdminPassword(pwd);
              setView("admin-dashboard");
            }}
          />
        )}
        {view === "admin-dashboard" && <AdminDashboard adminPassword={adminPassword} onLogout={handleLogout} />}
        {view === "owner-auth" && (
          <OwnerAuth
            onBack={() => setView("landing")}
            onLoggedIn={handleLoggedIn}
            onForgotPassword={() => setView("forgot-password")}
          />
        )}
        {view === "forgot-password" && <ForgotPasswordFlow onBack={() => setView("owner-auth")} />}
        {view === "dashboard" && session && <Dashboard session={session} onLogout={handleLogout} />}
        {view === "consumer-verify" && <ConsumerVerify onBack={() => setView("landing")} />}
      </div>
    </>
  );
}

// ============================================================
// NEW: HeroBackdrop — the full-viewport light gradient background used
// behind Landing and the Admin pages, matching the reference mockup.
// position: fixed + inset 0 means it always fills the browser edge to
// edge (left/right/top/bottom) regardless of scroll position or the
// app's own 700px/1180px centered content column, and negative z-index
// keeps it behind every normal-flow element without needing any of
// them to declare their own z-index. Purely CSS/SVG — no external
// image asset — so it never depends on a photo being bundled.
// ============================================================
// ============================================================
// Small field-prefix icons + IconInput helper — used by the redesigned
// Sign In / Register forms below to match the reference mockup (an icon
// inside each field, an eye toggle on password fields).
// ============================================================
function PersonFieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </svg>
  );
}
function LockFieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
function MailFieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}
function EyeToggleIcon({ open }) {
  return open ? (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a19.7 19.7 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 7 11 7a19.7 19.7 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

// A single-line icon-prefixed input, with an optional right-side toggle
// (used for the password show/hide eye icon). Wraps the shared inputStyle
// so it stays consistent with every other input in the app.
function IconInput({
  icon,
  type = "text",
  value,
  onChange,
  placeholder,
  onKeyDown,
  autoFocus,
  rightToggle, // { open, onClick } — omit for no right icon
}) {
  return (
    <div style={heroInputWrapperStyle}>
      <span style={heroInputIconStyle}>{icon}</span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        onKeyDown={onKeyDown}
        autoFocus={autoFocus}
        style={{
          ...inputStyle,
          marginBottom: 0,
          paddingLeft: "38px",
          paddingRight: rightToggle ? "38px" : "12px",
        }}
      />
      {rightToggle && (
        <button type="button" onClick={rightToggle.onClick} style={heroInputRightToggleStyle} tabIndex={-1}>
          <EyeToggleIcon open={rightToggle.open} />
        </button>
      )}
    </div>
  );
}

// Shared "Blockchain Secured / End-to-End Traceability / Data Integrity
// Assured" trust row — used under Landing and under the Sign In/Register
// card.
function TrustFooter() {
  return (
    <div style={heroFooterRowStyle}>
      <span style={heroFooterItemStyle}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L20 5V11C20 16 16.5 19.5 12 21C7.5 19.5 4 16 4 11V5L12 2Z" stroke="#64748b" strokeWidth="2" strokeLinejoin="round" />
        </svg>
        Blockchain Secured
      </span>
      <span style={heroFooterItemStyle}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="5" y="3" width="14" height="18" rx="2" stroke="#64748b" strokeWidth="2" />
          <line x1="8" y1="8" x2="16" y2="8" stroke="#64748b" strokeWidth="1.5" />
          <line x1="8" y1="12" x2="16" y2="12" stroke="#64748b" strokeWidth="1.5" />
          <line x1="8" y1="16" x2="13" y2="16" stroke="#64748b" strokeWidth="1.5" />
        </svg>
        End-to-End Traceability
      </span>
      <span style={heroFooterItemStyle}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="5" y="11" width="14" height="10" rx="2" stroke="#64748b" strokeWidth="2" />
          <path d="M8 11V7A4 4 0 0 1 16 7V11" stroke="#64748b" strokeWidth="2" />
        </svg>
        Data Integrity Assured
      </span>
    </div>
  );
}

function HeroBackdrop() {
  return (
    <div style={heroBackdropStyle}>
      <div style={heroBlobTopLeftStyle} />
      <div style={heroBlobBottomRightStyle} />

      {/* Hex network, top-right, with small icon glyphs on a few nodes */}
      <svg style={heroHexSvgStyle} viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
        <g stroke="#bfdbfe" strokeWidth="1.5" fill="none" opacity="0.8">
          <polygon points="100,10 170,50 170,130 100,170 30,130 30,50" />
          <polygon points="100,40 145,65 145,115 100,140 55,115 55,65" />
          <line x1="100" y1="10" x2="100" y2="40" />
          <line x1="170" y1="50" x2="145" y2="65" />
          <line x1="170" y1="130" x2="145" y2="115" />
          <line x1="100" y1="170" x2="100" y2="140" />
          <line x1="30" y1="130" x2="55" y2="115" />
          <line x1="30" y1="50" x2="55" y2="65" />
        </g>
        {[[100, 10], [170, 50], [170, 130], [100, 170], [30, 130], [30, 50]].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="3.5" fill="#93c5fd" />
        ))}
        {/* small vial glyph near the top node */}
        <g transform="translate(84,-14)" stroke="#93c5fd" strokeWidth="2" fill="none" opacity="0.85">
          <rect x="10" y="10" width="12" height="18" rx="3" />
          <rect x="9" y="4" width="14" height="7" rx="2" fill="#93c5fd" stroke="none" />
        </g>
        {/* small capsule glyph near the right node */}
        <g transform="translate(155,60) rotate(40)" opacity="0.85">
          <rect x="-11" y="-5" width="22" height="10" rx="5" fill="none" stroke="#93c5fd" strokeWidth="2" />
          <line x1="0" y1="-5" x2="0" y2="5" stroke="#93c5fd" strokeWidth="2" />
        </g>
        {/* small shield-check glyph near the bottom node */}
        <g transform="translate(84,152)" opacity="0.85">
          <path d="M12 2 L22 6 V15 C22 22 17 26 12 28 C7 26 2 22 2 15 V6 Z" fill="none" stroke="#93c5fd" strokeWidth="2" />
          <path d="M7 15 L11 19 L18 11" fill="none" stroke="#93c5fd" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </svg>

      {/* Vial + scattered pills, bottom-left corner */}
      <svg style={heroVialCornerStyle} viewBox="0 0 220 260" xmlns="http://www.w3.org/2000/svg">
        <g opacity="0.55">
          <rect x="60" y="30" width="70" height="150" rx="14" fill="#eaf2ff" stroke="#93c5fd" strokeWidth="2" />
          <rect x="72" y="10" width="46" height="26" rx="6" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="2" />
          <rect x="66" y="110" width="58" height="62" rx="8" fill="#60a5fa" opacity="0.55" />
        </g>
        <g opacity="0.6">
          <ellipse cx="40" cy="220" rx="22" ry="11" fill="#ffffff" stroke="#93c5fd" strokeWidth="2" />
          <path d="M22 220 A22 11 0 0 1 58 220" fill="#60a5fa" opacity="0.5" />
          <ellipse cx="150" cy="230" rx="18" ry="9" fill="#ffffff" stroke="#c4b5fd" strokeWidth="2" transform="rotate(-15 150 230)" />
          <ellipse cx="170" cy="200" rx="14" ry="7" fill="#dbeafe" stroke="#93c5fd" strokeWidth="2" transform="rotate(20 170 200)" />
        </g>
      </svg>

      {/* Clipboard + pen, bottom-right corner */}
      <svg style={heroClipboardCornerStyle} viewBox="0 0 220 240" xmlns="http://www.w3.org/2000/svg">
        <g opacity="0.5">
          <rect x="30" y="20" width="120" height="160" rx="10" fill="#ffffff" stroke="#cbd5e1" strokeWidth="2" />
          <rect x="60" y="8" width="60" height="20" rx="6" fill="#94a3b8" />
          <line x1="48" y1="60" x2="132" y2="60" stroke="#cbd5e1" strokeWidth="3" />
          <line x1="48" y1="80" x2="132" y2="80" stroke="#cbd5e1" strokeWidth="3" />
          <line x1="48" y1="100" x2="110" y2="100" stroke="#cbd5e1" strokeWidth="3" />
          <line x1="140" y1="40" x2="200" y2="220" stroke="#64748b" strokeWidth="6" strokeLinecap="round" />
          <line x1="188" y1="200" x2="200" y2="220" stroke="#334155" strokeWidth="6" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  );
}

// ============================================================
// Landing — Verify (Consumer) or Owner as two cards, Admin as a small
// pill button pinned to the top-right corner of the browser window.
// Redesigned to match the light "hero" reference mockup: full-bleed
// gradient background (HeroBackdrop, rendered by App()), a big icon +
// two-tone gradient title + tagline, then a white card holding the
// role picker, then a row of trust badges.
// ============================================================
function Landing({ onChoose }) {
  return (
    <div>
      <button style={heroAdminButtonStyle} onClick={() => onChoose("admin-login")}>
        <span style={{ marginRight: "6px" }}>👤</span>Admin
      </button>

      <div style={heroHeaderStyle}>
        <div style={heroIconCircleStyle}>
          <svg width="44" height="44" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M32 4L54 12V28C54 44 44 54 32 60C20 54 10 44 10 28V12L32 4Z" fill="#1d4ed8" />
            <path d="M32 20V40M22 30H42" stroke="white" strokeWidth="5" strokeLinecap="round" />
            <ellipse cx="46" cy="46" rx="9" ry="5" transform="rotate(45 46 46)" fill="#7c3aed" />
          </svg>
        </div>
        <h1 style={heroTitleStyle}>
          <span style={{ color: "#0f172a" }}>Pharmaceutical </span>
          <span style={{ color: "#2563eb" }}>Supply Chain App</span>
        </h1>
        <p style={heroTaglineStyle}>
          <span style={heroDashStyle} /> Secure. Transparent. Trusted. <span style={heroDashStyle} />
        </p>
      </div>

      <div style={heroCardStyle}>
        <h2 style={{ margin: 0, color: "#0f172a" }}>Who's logging in?</h2>
        <p style={{ color: "#64748b", marginTop: "4px", marginBottom: "10px" }}>
          Select your role to continue
        </p>
        <div style={heroUnderlineStyle} />

        <div style={landingCardsRow}>
          <div style={{ ...heroRoleCardStyle, borderColor: "#16a34a", backgroundColor: "#f0fdf4" }}>
            <div style={{ ...heroRoleIconStyle, backgroundColor: "#dcfce7" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5 13L10 18L19 7" stroke="#1f2937" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3 style={{ margin: "10px 0 6px 0", color: "#0f172a" }}>Verify a Tablet</h3>
            <p style={{ color: "#475569", fontSize: "13px", margin: "0 0 16px 0" }}>
              Verify the authenticity of your medicine and check its expiry.
            </p>
            <button style={{ ...heroButtonStyle, backgroundColor: "#16a34a" }} onClick={() => onChoose("consumer-verify")}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L20 5V11C20 16 16.5 19.5 12 21C7.5 19.5 4 16 4 11V5L12 2Z" stroke="white" strokeWidth="2" strokeLinejoin="round" />
                <path d="M8.5 12L11 14.5L15.5 9.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Verify 
            </button>
          </div>

          <div style={{ ...heroRoleCardStyle, borderColor: "#cbd5e1", backgroundColor: "#f8fafc" }}>
            <div style={{ ...heroRoleIconStyle, backgroundColor: "#e2e8f0" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="9" cy="8" r="3" fill="#1f2937" />
                <circle cx="16" cy="9" r="2.5" fill="#1f2937" />
                <path d="M3 20C3 16.5 5.5 14 9 14C12.5 14 15 16.5 15 20" stroke="#1f2937" strokeWidth="2" strokeLinecap="round" />
                <path d="M15 20C15 17.5 16 15.5 18.5 15.2C20.5 15 21.5 17 21.5 20" stroke="#1f2937" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <h3 style={{ margin: "10px 0 6px 0", color: "#0f172a" }}>Owner</h3>
            <p style={{ color: "#475569", fontSize: "13px", margin: "0 0 16px 0" }}>
              Manufacturer / Transporter / Distributor / Pharmacy - manage and track batches.
            </p>
            <button style={{ ...heroButtonStyle, backgroundColor: "#334155" }} onClick={() => onChoose("owner-auth")}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="4" y="12" width="4" height="8" fill="white" />
                <rect x="10" y="8" width="4" height="12" fill="white" />
                <rect x="16" y="4" width="4" height="16" fill="white" />
              </svg>
              Open Dashboard 
            </button>
          </div>
        </div>
      </div>

      <TrustFooter />
    </div>
  );
}

// ============================================================
// Admin login — single password gate
// ============================================================
function AdminLogin({ onBack, onSuccess }) {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState({ type: "", text: "" });
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    setMessage({ type: "", text: "" });
    try {
      await adminLogin(password);
      onSuccess(password);
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={heroFloatingDarkCardStyle}>
      <h2>Admin Login</h2>
      <input
        type="password"
        placeholder="Admin password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={inputStyle}
      />
      <button style={buttonStyle} onClick={submit} disabled={loading}>
        {loading ? "Checking..." : "Log In"}
      </button>
      <button style={{ ...buttonStyle, backgroundColor: "#333", marginTop: "8px" }} onClick={onBack}>
        Back
      </button>
      <MessageBox message={message} />
    </div>
  );
}

// ============================================================
// Admin dashboard — read-only list of everyone who signed up
// ============================================================
function AdminDashboard({ adminPassword, onLogout }) {
  const [tab, setTab] = useState("participants"); // "participants" | "batches"

  return (
    <div style={heroFloatingDarkCardStyle}>
      <h2>Admin Dashboard</h2>

      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        <button
          style={{ ...tabButtonStyle, ...(tab === "participants" ? tabActiveStyle : {}) }}
          onClick={() => setTab("participants")}
        >
          Participants
        </button>
        <button
          style={{ ...tabButtonStyle, ...(tab === "batches" ? tabActiveStyle : {}) }}
          onClick={() => setTab("batches")}
        >
          All Batches
        </button>
      </div>

      {tab === "participants" ? <AdminParticipantsPanel adminPassword={adminPassword} /> : <AdminBatchesPanel />}

      <button style={{ ...buttonStyle, marginTop: "12px" }} onClick={onLogout}>
        Log Out
      </button>
    </div>
  );
}

function AdminParticipantsPanel({ adminPassword }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toggling, setToggling] = useState(null); // username currently being toggled

  const load = () => {
    setLoading(true);
    listAllUsers()
      .then(setUsers)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    Promise.resolve().then(load);
  }, []);

  const handleToggle = async (user) => {
    setToggling(user.username);
    setError("");
    try {
      await adminSetAccountStatus(adminPassword, user.username, !user.disabled);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setToggling(null);
    }
  };

  return (
    <div>
      {loading && <p>Loading...</p>}
      {error && <p style={{ color: "#fca5a5" }}>{error}</p>}
      {!loading && users.length === 0 && <p style={{ color: "#888" }}>No participants have signed up yet.</p>}
      {users.map((u) => (
        <div key={u.username} style={{ ...readonlyBoxStyle, textAlign: "left" }}>
          <strong>{u.username}</strong> — <span style={{ color: "#a78bfa" }}>{u.role}</span>
          <br />
          <small style={{ color: "#888" }}>{u.city}</small>
          <br />
          <small style={{ color: "#666" }}>{u.walletAddress}</small>
          <br />
          <span style={{ color: u.disabled ? "#f59e0b" : "#86efac", fontSize: "13px" }}>
            {u.disabled
              ? u.disabledReason === "admin"
                ? "● Disabled by admin"
                : `● Disabled (locked) — re-enables ${new Date(u.disabledUntil).toLocaleString("en-GB", {
                    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                  })}`
              : "● Active"}
          </span>
          <button
            style={{
              ...buttonStyle,
              marginTop: "8px",
              backgroundColor: u.disabled ? "#16a34a" : "#dc2626",
            }}
            onClick={() => handleToggle(u)}
            disabled={toggling === u.username}
          >
            {toggling === u.username ? "Updating..." : u.disabled ? "Enable Account" : "Disable Account"}
          </button>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// NEW: AdminBatchesPanel — every batch ever registered, grouped by
// which Manufacturer registered it, with registration date and full
// batch details. Reads straight from the chain (BatchRegistered events
// + getBatch per id) via the read-only provider — no MetaMask needed,
// same as the consumer verify flow, since this is just reading public
// data.
// ============================================================
function AdminBatchesPanel() {
  const [groups, setGroups] = useState([]); // [{ manufacturer, user, batches: [...] }]
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const contract = getReadOnlyContract();
        const provider = getProvider();

        const registeredLogs = await contract.queryFilter(contract.filters.BatchRegistered(), 0, "latest");

        const batchDetails = await Promise.all(
          registeredLogs.map(async (log) => {
            const id = log.args.id;
            const [batch, block] = await Promise.all([
              contract.getBatch(id),
              provider.getBlock(log.blockNumber),
            ]);
            const ratingCount = Number(batch.ratingCount);
            const ratingSum = Number(batch.ratingSum);
            return {
              id: id.toString(),
              batchCode: batch.batchCode,
              productName: batch.productName,
              quantity: batch.quantity.toString(),
              manufacturer: log.args.owner,
              manufactureDate: batch.manufactureDate.toString(),
              expiryDate: batch.expiryDate.toString(),
              deliveryStatus: Number(batch.deliveryStatus),
              registeredAt: block.timestamp,
              ratingCount,
              averageRating: ratingCount > 0 ? ratingSum / ratingCount : null,
            };
          })
        );

        const uniqueManufacturers = [...new Set(batchDetails.map((b) => b.manufacturer))];
        const lookups = await Promise.all(
          uniqueManufacturers.map(async (addr) => [addr, await getUserByAddress(addr)])
        );
        const userByAddress = Object.fromEntries(lookups);

        const grouped = uniqueManufacturers.map((addr) => ({
          manufacturer: addr,
          user: userByAddress[addr],
          batches: batchDetails
            .filter((b) => b.manufacturer === addr)
            .sort((a, b) => b.registeredAt - a.registeredAt),
        }));
        grouped.sort((a, b) => (b.batches[0]?.registeredAt || 0) - (a.batches[0]?.registeredAt || 0));

        if (!cancelled) setGroups(grouped);
      } catch (err) {
        if (!cancelled) setError(describeError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <p>Loading batches from the chain...</p>;
  if (error) return <p style={{ color: "#fca5a5" }}>{error}</p>;
  if (groups.length === 0) return <p style={{ color: "#888" }}>No batches have been registered yet.</p>;

  return (
    <div style={{ textAlign: "left" }}>
      {groups.map((g) => (
        <div key={g.manufacturer} style={{ marginBottom: "20px" }}>
          <h3 style={{ color: "#6c2bd9", marginBottom: "4px" }}>
            {g.user ? `${g.user.username} (Manufacturer)` : shortenAddressFallback(g.manufacturer)}
            {g.user?.city && <span style={{ color: "#888", fontSize: "14px" }}> — {g.user.city}</span>}
          </h3>
          <small style={{ color: "#666" }}>{g.manufacturer}</small>

          {g.batches.map((b) => (
            <div key={b.id} style={{ ...readonlyBoxStyle, marginTop: "10px" }}>
              <strong>{b.batchCode}</strong> <span style={{ color: "#888" }}>(ID {b.id})</span>
              <p style={{ margin: "6px 0" }}>
                <strong>Product:</strong> {b.productName} &nbsp;·&nbsp; <strong>Quantity:</strong> {b.quantity}
              </p>
              <p style={{ margin: "6px 0" }}>
                <strong>Registered:</strong> {formatBlockchainTime(b.registeredAt)}
              </p>
              <p style={{ margin: "6px 0" }}>
                <strong>Manufacture Date:</strong> {formatDateOnly(b.manufactureDate)} &nbsp;·&nbsp;{" "}
                <strong>Expiry Date:</strong> {formatDateOnly(b.expiryDate)}
              </p>
              <p style={{ margin: "6px 0" }}>
                <strong>Delivery Status:</strong> {DELIVERY_STATUS_LABELS[b.deliveryStatus]} &nbsp;·&nbsp;{" "}
                <strong>Rating:</strong>{" "}
                {b.ratingCount > 0 ? `${b.averageRating.toFixed(1)} / 5 (${b.ratingCount})` : "No ratings yet"}
              </p>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Owner auth — Sign In / Sign Up
// ============================================================

function OwnerAuth({ onBack, onLoggedIn, onForgotPassword }) {
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  // NEW: while SignInForm is in its "Connect MetaMask" step, hide the
  // outer Back button and the hero header/footer chrome — Cancel (inside
  // that step) already returns to the plain sign-in form, and that step
  // keeps its own dark, focused layout rather than the light auth card.
  const [inConnectStep, setInConnectStep] = useState(false);

  return (
    <div>
      {inConnectStep ? (
        <h1 style={titleStyle}>Pharmaceutical Supply Chain App</h1>
      ) : (
        <div style={heroAuthHeaderStyle}>
          <div style={heroIconCircleStyle}>
            <svg width="40" height="40" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M32 4L54 12V28C54 44 44 54 32 60C20 54 10 44 10 28V12L32 4Z" fill="#2563eb" />
              <path d="M32 20V40M22 30H42" stroke="white" strokeWidth="5" strokeLinecap="round" />
            </svg>
          </div>
          <h1 style={{ ...heroTitleStyle, fontSize: "26px" }}>
            <span style={{ color: "#0f172a" }}>Pharmaceutical </span>
            <span style={{ color: "#2563eb" }}>Supply Chain App</span>
          </h1>
          <p style={{ ...heroTaglineStyle, fontSize: "13px" }}>
            <span style={heroDashStyle} /> Secure. Transparent. Trusted. <span style={heroDashStyle} />
          </p>
        </div>
      )}

      <div style={inConnectStep ? heroFloatingDarkCardStyle : heroFloatingLightCardStyle}>
        {mode === "signin" ? (
          <SignInForm
            onLoggedIn={onLoggedIn}
            onConnectStepChange={setInConnectStep}
            onForgotPassword={onForgotPassword}
            onSwitchToSignUp={() => setMode("signup")}
          />
        ) : (
          <SignUpForm onSignedUp={() => setMode("signin")} onSwitchToSignIn={() => setMode("signin")} />
        )}

        {!inConnectStep && (
          <button style={heroLightBackButtonStyle} onClick={onBack}>
            ← Back
          </button>
        )}
      </div>

      {!inConnectStep && <TrustFooter />}
    </div>
  );
}

function SignInForm({ onLoggedIn, onConnectStepChange, onForgotPassword, onSwitchToSignUp }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [loading, setLoading] = useState(false);

  // NEW: after a successful username/password check, we don't silently
  // try MetaMask in the background anymore — we show an explicit
  // "Connect to MetaMask" / "Cancel" step instead, and only touch
  // MetaMask once the user clicks Connect.
  const [pendingLogin, setPendingLogin] = useState(null); // { username, password, walletAddress, ...data }
  const [connecting, setConnecting] = useState(false);

  // Shown if MetaMask connects but to a DIFFERENT account than the one
  // that was imported at signup — offers a way to re-fetch the private
  // key for import (requires the password again).
  const [needsImport, setNeedsImport] = useState(null); // { username, password }
  const [reimportInfo, setReimportInfo] = useState(null); // { walletAddress, privateKey }

  const submit = async () => {
    if (!username.trim() || !password) {
      setMessage({ type: "error", text: "Enter both username and password." });
      return;
    }
    setLoading(true);
    setMessage({ type: "", text: "" });
    try {
      const data = await login({ username: username.trim(), password });
      // Password checked out — now show the explicit MetaMask connect
      // step rather than jumping straight into extension popups.
      setPendingLogin({ ...data, password });
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  };

  // Runs only when the user clicks "Connect to MetaMask" below.
  const handleConnect = async () => {
    if (!pendingLogin) return;
    setMessage({ type: "", text: "" });
    setConnecting(true);
    try {
      if (!isMetaMaskAvailable()) {
        setMessage({ type: "error", text: "MetaMask is not installed. Install it, then import your account." });
        setNeedsImport({ username: pendingLogin.username });
        return;
      }

      const networkOk = await isMetaMaskOnCorrectNetwork();
      if (!networkOk) {
        setMessage({ type: "pending", text: "Switching MetaMask to Localhost 8545..." });
        await switchMetaMaskToLocalNetwork();
      }

      // Force MetaMask's account picker every time, so the user can
      // actually switch accounts here instead of silently getting
      // whatever was last connected (see requestMetaMaskAccountSelection
      // for why a revoke-then-request is needed to guarantee this).
      let connected = await requestMetaMaskAccountSelection();
      if (!connected) {
        // User closed/cancelled the picker (or clicked Cancel inside
        // MetaMask) — per the brief, don't treat that as a hard error.
        // Fall back to whatever account was already connected before,
        // and just check that one instead.
        connected = await getCurrentlyConnectedAccount();
      }
      if (!connected) {
        setMessage({ type: "error", text: "MetaMask isn't connected to this site. Click Connect to try again." });
        return;
      }

      if (connected.toLowerCase() !== pendingLogin.walletAddress.toLowerCase()) {
        setMessage({
          type: "error",
          text: "That's a different account than the one imported at signup. Import the correct account below, then click Connect again.",
        });
        setNeedsImport({ username: pendingLogin.username });
        return;
      }

      onLoggedIn(pendingLogin);
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Could not connect to MetaMask." });
    } finally {
      setConnecting(false);
    }
  };

  const handleCancel = () => {
    setPendingLogin(null);
    setNeedsImport(null);
    setReimportInfo(null);
    setReimportPassword("");
    setMessage({ type: "", text: "" });
  };

  const [reimportPassword, setReimportPassword] = useState("");

  // NEW: tell OwnerAuth whether we're in the "Connect MetaMask" step, so
  // it can hide the Sign In/Sign Up tabs and its own Back button (Cancel
  // below already handles leaving this step cleanly).
  useEffect(() => {
    onConnectStepChange?.(!!pendingLogin);
  }, [pendingLogin, onConnectStepChange]);

  const handleReimport = async () => {
    if (!needsImport || !reimportPassword) return;
    setMessage({ type: "", text: "" });
    try {
      const result = await revealPrivateKey(needsImport.username, reimportPassword);
      setReimportInfo(result);
      setReimportPassword("");
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    }
  };

  // ===== Step 2: explicit MetaMask connect prompt =====
  if (pendingLogin) {
    return (
      <div>
        <p style={{ marginTop: 0 }}>
          Signed in as <strong>{pendingLogin.username}</strong>. Connect MetaMask to finish-this
          confirms the wallet in this browser really belongs to this account.
        </p>
        <p style={{ fontSize: "13px", color: "#888" }}>
          If MetaMask opens already connected to a <strong>different</strong> account than shown above,
          click <strong>Edit accounts</strong> in the popup, <strong>untick</strong> the account
          currently connected, <strong>tick</strong> the account for <strong>{pendingLogin.username}</strong>{" "}
          ({pendingLogin.walletAddress}), then click Connect at the bottom.
        </p>

        <div style={{ ...readonlyBoxStyle, textAlign: "left", marginBottom: "12px" }}>
          <small style={{ color: "#888" }}>Expected account for {pendingLogin.username}:</small>
          <br />
          <code style={{ fontSize: "13px", color: "#c4b5fd", wordBreak: "break-all" }}>
            {pendingLogin.walletAddress}
          </code>
        </div>


        <p style={{ fontSize: "13px", color: "#f59e0b" }}>
          If that address doesn't appear anywhere in the popup-not even under "Edit accounts" - it
          means this account was never imported into MetaMask in this browser. Use the button below
          instead of clicking Connect.
        </p>

        <button style={buttonStyle} onClick={handleConnect} disabled={connecting}>
          {connecting ? "Connecting..." : "Connect to MetaMask"}
        </button>
        <div style={{ height: "8px" }} />
        <button style={{ ...buttonStyle, backgroundColor: "#333" }} onClick={handleCancel} disabled={connecting}>
          Cancel
        </button>
        <div style={{ height: "8px" }} />
        {!needsImport && (
          <button
            style={{ ...buttonStyle, backgroundColor: "#333" }}
            onClick={() => setNeedsImport({ username: pendingLogin.username })}
          >
            account isn't imported yet - show me the key
          </button>
        )}

        <MessageBox message={message} />

        {/* NEW: explicit password re-entry, same as signup would require —
            reusing the sign-in password silently was too implicit. This
            confirms it's really you asking to see the key, right here,
            not just re-sending whatever was typed earlier. */}
        {needsImport && !reimportInfo && (
          <div style={{ marginTop: "10px", textAlign: "left" }}>
            <label style={labelStyle}>Re-enter your password to reveal the private key</label>
            <input
              type="password"
              value={reimportPassword}
              onChange={(e) => setReimportPassword(e.target.value)}
              style={inputStyle}
              onKeyDown={(e) => e.key === "Enter" && handleReimport()}
              autoFocus
            />
            <button style={buttonStyle} onClick={handleReimport} disabled={!reimportPassword}>
              Confirm — Reveal Private Key
            </button>
          </div>
        )}

        {reimportInfo && (
          <ImportWalletModal
            walletAddress={reimportInfo.walletAddress}
            privateKey={reimportInfo.privateKey}
            username={needsImport?.username}
            onDone={() => {
              setReimportInfo(null);
              setNeedsImport(null);
              setMessage({ type: "success", text: "Imported. Click Connect to MetaMask again." });
            }}
          />
        )}
      </div>
    );
  }

  // ===== Step 1: plain username/password form =====
  return (
    <div>
      <h2 style={{ margin: 0, textAlign: "center", color: "#0f172a" }}>Sign In</h2>
      <p style={heroAuthSubtitleStyle}>Welcome back! Please sign in to continue.</p>

      <label style={heroFieldLabelStyle}>Username</label>
      <IconInput
        icon={<PersonFieldIcon />}
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Enter your username"
      />

      <label style={heroFieldLabelStyle}>Password</label>
      <IconInput
        icon={<LockFieldIcon />}
        type={showPassword ? "text" : "password"}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Enter your password"
        onKeyDown={(e) => e.key === "Enter" && submit()}
        rightToggle={{ open: showPassword, onClick: () => setShowPassword((v) => !v) }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "-4px 0 16px" }}>
        <label style={heroCheckboxRowStyle}>
          <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
          Remember me
        </label>
        <button type="button" style={heroBlueLinkStyle} onClick={() => onForgotPassword?.()}>
          Forgot password?
        </button>
      </div>

      <button style={heroBlueButtonStyle} onClick={submit} disabled={loading}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10 17l5-5-5-5M15 12H3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {loading ? "Signing in..." : "Sign In"}
      </button>

      <MessageBox message={message} />

      <p style={heroSwitchModeRowStyle}>
        Don't have an account?{" "}
        <button type="button" style={heroBlueLinkStyle} onClick={() => onSwitchToSignUp?.()}>
          Register
        </button>
      </p>
    </div>
  );
}

function SignUpForm({ onSignedUp, onSwitchToSignIn }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [role, setRole] = useState("");
  const [city, setCity] = useState("");
  const [sport, setSport] = useState("");
  const [food, setFood] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [loading, setLoading] = useState(false);
  const [importInfo, setImportInfo] = useState(null); // { walletAddress, privateKey } once signed up

  const submit = async () => {
    setMessage({ type: "", text: "" });

    if (!username.trim() || !password || !role || !city || !sport || !food) {
      setMessage({ type: "error", text: "Please fill in every field, including both security questions." });
      return;
    }
    if (!PASSWORD_REGEX.test(password)) {
      setMessage({ type: "error", text: PASSWORD_HINT });
      return;
    }
    if (password !== confirmPassword) {
      setMessage({ type: "error", text: "Passwords do not match." });
      return;
    }
    if (!agreedToTerms) {
      setMessage({ type: "error", text: "Please agree to the Terms & Conditions and Privacy Policy." });
      return;
    }

    setLoading(true);
    try {
      setMessage({ type: "pending", text: "Creating your account and funding your wallet..." });
      const result = await signup({
        username: username.trim(),
        password,
        role,
        city,
        sport,
        food,
      });
      // NEW: show the MetaMask import step instead of going straight
      // back to Sign In — the account is useless for transactions until
      // it's imported.
      setImportInfo({ walletAddress: result.walletAddress, privateKey: result.privateKey });
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 style={{ margin: 0, textAlign: "center", color: "#0f172a" }}>Register</h2>
      <p style={heroAuthSubtitleStyle}>Create your account to get started.</p>

      <label style={heroFieldLabelStyle}>Username</label>
      <IconInput icon={<PersonFieldIcon />} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter your username" />

      <label style={heroFieldLabelStyle}>Password</label>
      <IconInput
        icon={<LockFieldIcon />}
        type={showPassword ? "text" : "password"}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Create a password"
        rightToggle={{ open: showPassword, onClick: () => setShowPassword((v) => !v) }}
      />
      <p style={{ fontSize: "12px", color: "#64748b", marginTop: "-10px", marginBottom: "12px" }}>{PASSWORD_HINT}</p>

      <label style={heroFieldLabelStyle}>Confirm Password</label>
      <IconInput
        icon={<LockFieldIcon />}
        type={showConfirmPassword ? "text" : "password"}
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        placeholder="Confirm your password"
      />

      <label style={heroFieldLabelStyle}>Role</label>
      <select value={role} onChange={(e) => setRole(e.target.value)} style={heroSelectStyle}>
        <option value="">-- Select Role --</option>
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>

      <label style={heroFieldLabelStyle}>City</label>
      <select value={city} onChange={(e) => setCity(e.target.value)} style={heroSelectStyle}>
        <option value="">-- Select City --</option>
        {INDIAN_CITIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      {/* NEW: two security questions, used later by Forgot Password
          instead of asking for an email you may not have registered. */}
      <label style={heroFieldLabelStyle}>Favourite Sport (used for password recovery)</label>
      <select value={sport} onChange={(e) => setSport(e.target.value)} style={heroSelectStyle}>
        <option value="">-- Select Sport --</option>
        {SPORTS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <label style={heroFieldLabelStyle}>Favourite Food (used for password recovery)</label>
      <select value={food} onChange={(e) => setFood(e.target.value)} style={heroSelectStyle}>
        <option value="">-- Select Food --</option>
        {INDIAN_FOODS.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>
      <p style={{ fontSize: "12px", color: "#64748b", marginTop: "-8px", marginBottom: "14px" }}>
        Remember these two-you'll be asked to pick them again (not shown to you) if you ever need to
        reset your password.
      </p>

      <label style={{ ...heroCheckboxRowStyle, marginBottom: "16px" }}>
        <input type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} />
        I agree to the <span style={{ color: "#2563eb", fontWeight: "600" }}>Terms &amp; Conditions</span> and{" "}
        <span style={{ color: "#2563eb", fontWeight: "600" }}>Privacy Policy</span>
      </label>

      <button style={heroBlueButtonStyle} onClick={submit} disabled={loading}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="9" cy="8" r="4" stroke="white" strokeWidth="2" />
          <path d="M2 20c0-4.4 3.1-8 7-8s7 3.6 7 8" stroke="white" strokeWidth="2" strokeLinecap="round" />
          <path d="M19 8v6M16 11h6" stroke="white" strokeWidth="2" strokeLinecap="round" />
        </svg>
        {loading ? "Creating account..." : "Create Account"}
      </button>
      <MessageBox message={message} />

      <p style={heroSwitchModeRowStyle}>
        Already have an account?{" "}
        <button type="button" style={heroBlueLinkStyle} onClick={() => onSwitchToSignIn?.()}>
          Sign in
        </button>
      </p>

      {importInfo && (
        <ImportWalletModal
          walletAddress={importInfo.walletAddress}
          privateKey={importInfo.privateKey}
          username={username.trim()}
          onDone={() => {
            setImportInfo(null);
            setMessage({ type: "success", text: "Account created and imported. You can now sign in." });
            onSignedUp();
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// ForgotPasswordFlow — username -> re-pick security answers (never
// pre-filled) -> if correct, set a new password. 5 wrong attempts locks
// the account for 24 hours (enforced server-side; this UI just surfaces
// the resulting messages).
// ============================================================
function ForgotPasswordFlow({ onBack }) {
  const [step, setStep] = useState("answer"); // "answer" | "reset" | "done"
  const [username, setUsername] = useState("");
  const [sport, setSport] = useState("");
  const [food, setFood] = useState("");
  const [resetToken, setResetToken] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [message, setMessage] = useState({ type: "", text: "" });
  const [loading, setLoading] = useState(false);

  const submitAnswers = async () => {
    setMessage({ type: "", text: "" });
    if (!username.trim() || !sport || !food) {
      setMessage({ type: "error", text: "Please fill in your username and both security answers." });
      return;
    }
    setLoading(true);
    try {
      const result = await verifyForgotPasswordAnswers(username.trim(), sport, food);
      if (result.valid) {
        setResetToken(result.resetToken);
        setStep("reset");
        setMessage({ type: "success", text: "Verified. Choose a new password below." });
      }
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const submitNewPassword = async () => {
    setMessage({ type: "", text: "" });
    if (!PASSWORD_REGEX.test(newPassword)) {
      setMessage({ type: "error", text: PASSWORD_HINT });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setMessage({ type: "error", text: "Passwords do not match." });
      return;
    }
    setLoading(true);
    try {
      await resetPasswordWithToken(username.trim(), resetToken, newPassword);
      setStep("done");
      setMessage({ type: "success", text: "Password reset. You can sign in with your new password now." });
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={heroFloatingDarkCardStyle}>
      <h2>Forgot Password</h2>

      {step === "answer" && (
        <>
          <label style={labelStyle}>Username</label>
          <input type="text" value={username} placeholder="Enter user name" onChange={(e) => setUsername(e.target.value)} style={inputStyle} />

          <label style={labelStyle}>Favourite Sport</label>
          <select value={sport} onChange={(e) => setSport(e.target.value)} style={inputStyle}>
            <option value="">-- Select Sport --</option>
            {SPORTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <label style={labelStyle}>Favourite Food</label>
          <select value={food} onChange={(e) => setFood(e.target.value)} style={inputStyle}>
            <option value="">-- Select Food --</option>
            {INDIAN_FOODS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>

          <button style={buttonStyle} onClick={submitAnswers} disabled={loading}>
            {loading ? "Checking..." : "Verify Answers"}
          </button>
        </>
      )}

      {step === "reset" && (
        <>
          <label style={labelStyle}>New Password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            style={inputStyle}
          />
          <p style={{ fontSize: "12px", color: "#888", marginTop: "-8px", marginBottom: "12px" }}>{PASSWORD_HINT}</p>

          <label style={labelStyle}>Confirm New Password</label>
          <input
            type="password"
            value={confirmNewPassword}
            onChange={(e) => setConfirmNewPassword(e.target.value)}
            style={inputStyle}
          />

          <button style={buttonStyle} onClick={submitNewPassword} disabled={loading}>
            {loading ? "Saving..." : "Set New Password"}
          </button>
        </>
      )}

      {step === "done" && (
        <button style={buttonStyle} onClick={onBack}>
          Go to Sign In
        </button>
      )}

      <MessageBox message={message} />

      {step !== "done" && (
        <button style={{ ...buttonStyle, backgroundColor: "#333", marginTop: "12px" }} onClick={onBack}>
          Back
        </button>
      )}
    </div>
  );
}

// ============================================================
// Dashboard, once logged in as an owner participant
// ============================================================
function Dashboard({ session, onLogout }) {
  const { username, role, city, walletAddress } = session;

  const [balance, setBalance] = useState(null);
  const [faucetLoading, setFaucetLoading] = useState(false);
  const [faucetMessage, setFaucetMessage] = useState("");
  // NEW: sidebar navigation state. Always lands on "welcome" first —
  // per the brief, the first thing an owner sees after connecting
  // MetaMask is a welcome screen, not straight into a form.
  const [activeTab, setActiveTab] = useState("welcome");

  const refreshBalance = async () => {
    try {
      const bal = await getBalance(walletAddress);
      setBalance(bal);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    // Wrapped in a promise chain (not a direct synchronous call) so the
    // effect only reacts to walletAddress changing; the actual state
    // update happens asynchronously once the balance resolves.
    Promise.resolve().then(refreshBalance);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress]);

  // NEW: if the user switches accounts inside MetaMask itself while
  // this dashboard is open, force a logout — continuing to show this
  // session's data while MetaMask is actually pointed at a different
  // account would be misleading and unsafe (any transaction would now
  // be signed by the OTHER account, not the one shown here).
  useEffect(() => {
    if (!isMetaMaskAvailable()) return;
    const handleAccountsChanged = (accounts) => {
      const newAddr = accounts?.[0];
      if (!newAddr || newAddr.toLowerCase() !== walletAddress.toLowerCase()) {
        onLogout();
      }
    };
    window.ethereum.on?.("accountsChanged", handleAccountsChanged);
    window.ethereum.on?.("chainChanged", () => onLogout());
    return () => {
      window.ethereum?.removeListener?.("accountsChanged", handleAccountsChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress]);

  const handleFaucet = async () => {
    setFaucetLoading(true);
    setFaucetMessage("");
    try {
      const data = await requestFaucet(walletAddress);
      setBalance(data.newBalance);
      setFaucetMessage(`Sent ${data.amount} test ETH. Tx: ${data.txHash.slice(0, 10)}...`);
    } catch (err) {
      setFaucetMessage(err.message);
    } finally {
      setFaucetLoading(false);
    }
  };

  const navItems = NAV_ITEMS[role] || [];

  return (
    <div style={{ position: "relative" }}>
      {/* NEW: Logout moved out of the account panel entirely, to the
          top-right corner of the whole dashboard — matches the Admin
          button placement on the landing page. */}
      <button style={dashboardLogoutButtonStyle} onClick={onLogout}>
        Log Out
      </button>

      <div style={{ display: "flex", gap: "24px", alignItems: "flex-start" }}>
        {/* CHANGED: no more flexWrap — a sidebar wrapping below its
            content (instead of staying beside it) was exactly the layout
            bug reported. dashboardPageStyle is wide enough (1180px) that
            the two columns always fit side by side; on a genuinely
            narrow window this scrolls horizontally instead of stacking,
            which is the right tradeoff for a desktop tool like this. */}
        <div style={{ width: "220px", flexShrink: 0 }}>
          {/* NEW: account panel — MetaMask status is now plain colored
              text (no badge/box), username is centered and the most
              prominent line, balance sits at the bottom, in that order. */}
          <div style={{ ...cardStyle, textAlign: "center" }}>
            <p style={{ fontSize: "12px", color: "#86efac", margin: "0 0 8px 0" }}>MetaMask Connected</p>
            <strong style={{ fontSize: "19px", display: "block" }}>{username}</strong>
            <span style={{ color: "#a78bfa", fontSize: "13px" }}>{role}</span>
            <br />
            <small style={{ color: "#888" }}>{city}</small>
            <p style={{ fontSize: "13px", margin: "10px 0 0 0" }}>
              {balance ? `${Number(balance).toFixed(3)} ETH` : "—"}
            </p>

            {balance !== null && Number(balance) <= LOW_BALANCE_THRESHOLD_ETH && (
              <div style={{ marginTop: "10px", padding: "10px", borderRadius: "8px", backgroundColor: "#450a0a", border: "1px solid #dc2626", textAlign: "left" }}>
                <p style={{ margin: "0 0 8px 0", color: "#fca5a5", fontWeight: "bold", fontSize: "13px" }}>Low Test ETH Balance</p>
                <button style={buttonStyle} onClick={handleFaucet} disabled={faucetLoading}>
                  {faucetLoading ? "Requesting..." : "Add 10 Test ETH"}
                </button>
              </div>
            )}
            {faucetMessage && <p style={{ fontSize: "12px", marginTop: "8px" }}>{faucetMessage}</p>}
          </div>

          {/* NEW: WhatsApp-style icon rail — a narrow column of rounded
              icon buttons with a small caption under each, instead of
              full-width text buttons. */}
          <div style={sidebarIconRailStyle}>
            <SidebarIconButton
              icon={HomeIcon}
              label="Welcome"
              active={activeTab === "welcome"}
              onClick={() => setActiveTab("welcome")}
            />
            {navItems.map((item) => (
              <SidebarIconButton
                key={item.key}
                icon={NAV_ICONS[item.key] || DocumentIcon}
                label={item.label}
                active={activeTab === item.key}
                onClick={() => setActiveTab(item.key)}
              />
            ))}
          </div>
        </div>

        {/* ===== Main content area ===== */}
        <div style={{ flex: "1 1 480px", minWidth: 0 }}>
          {activeTab === "welcome" && <WelcomePanel session={session} />}

          {activeTab === "register" && <RegisterBatchCard session={session} onDone={refreshBalance} />}

          {activeTab === "registered" && <RegisteredBatchesPanel walletAddress={walletAddress} />}

          {activeTab === "transfer" && (
            <>
              <TransferOwnershipCard session={session} onDone={refreshBalance} />
              <MyBatchesPanel
                mode="received"
                walletAddress={walletAddress}
                title="Batches You've Handled"
                emptyText="No batches have been transferred to you yet."
              />
            </>
          )}

          {activeTab === "deliveries" && <PharmacyBatchesPanel session={session} onDone={refreshBalance} />}

          {activeTab === "fetch" && <BatchHistory />}
        </div>
      </div>
    </div>
  );
}

// NEW: a single rounded icon button + caption, used for the WhatsApp-
// style sidebar rail.
function SidebarIconButton({ icon: Icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "4px",
        width: "100%",
        padding: "10px 4px",
        marginBottom: "6px",
        border: "none",
        borderRadius: "10px",
        backgroundColor: active ? "#6c2bd9" : "transparent",
        color: active ? "#fff" : "#ccc",
        cursor: "pointer",
      }}
    >
      <span
        style={{
          width: "36px",
          height: "36px",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // Flat gray circle for inactive icons, subtle white tint for the
          // active one — no colorful emoji backgrounds.
          backgroundColor: active ? "rgba(255,255,255,0.15)" : "#2a2a2a",
          color: active ? "#fff" : "#999",
        }}
      >
        <Icon />
      </span>
      <span style={{ fontSize: "11px", textAlign: "center", lineHeight: "1.2" }}>{label}</span>
    </button>
  );
}

// ============================================================
// NEW: WelcomePanel — the very first thing an owner sees after
// signing in and connecting MetaMask, before picking anything from the
// sidebar.
// ============================================================
const ROLE_WELCOME_HINT = {
  Manufacturer: "register a new batch, or see every batch you've registered so far",
  Transporter: "transfer a batch onward to a Distributor, or see every batch that's passed through your hands",
  Distributor: "transfer a batch onward to a Pharmacy, or see every batch that's passed through your hands",
  Pharmacy: "see everything you're holding, mark batches as delivered, or check what's still pending",
};

function WelcomePanel({ session }) {
  const { walletAddress, role } = session;
  const [stats, setStats] = useState(null);
  const [ratingList, setRatingList] = useState(null); // { kind: "positive"|"negative", entries: [...] } | null
  const [ratingLoading, setRatingLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const contract = getReadOnlyContract();

        // Total registered — only meaningful for a Manufacturer, 0 for
        // everyone else (they never call registerBatch themselves).
        const registeredLogs = await contract.queryFilter(contract.filters.BatchRegistered(), 0, "latest");
        const totalRegistered = registeredLogs.filter(
          (l) => l.args.owner.toLowerCase() === walletAddress.toLowerCase()
        ).length;

        // Delivered / pending — only meaningful for a Pharmacy, who is
        // the only role that ever calls markDelivered.
        const deliveryLogs = await contract.queryFilter(contract.filters.DeliveryStatusUpdated(), 0, "latest");
        const mine = deliveryLogs.filter((l) => l.args.pharmacy.toLowerCase() === walletAddress.toLowerCase());
        const totalDelivered = mine.filter((l) => Number(l.args.status) === 1).length;
        const totalNotDelivered = mine.filter((l) => Number(l.args.status) === 2).length;

        const positive = await contract.positiveRatingsReceived(walletAddress);
        const negative = await contract.negativeRatingsReceived(walletAddress);

        if (!cancelled) {
          setStats({
            totalRegistered,
            totalDelivered,
            totalNotDelivered,
            positive: Number(positive),
            negative: Number(negative),
          });
        }
      } catch (err) {
        console.error(err);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  const showRatingList = async (kind) => {
    setRatingLoading(true);
    setRatingList(null);
    try {
      const contract = getReadOnlyContract();
      const provider = getProvider();
      // ParticipantRated(id, rater, rated, positive, timestamp) — filter
      // on the `rated` indexed param to get only ratings THIS user received.
      const logs = await contract.queryFilter(
        contract.filters.ParticipantRated(null, null, walletAddress),
        0,
        "latest"
      );
      const filtered = logs.filter((l) => l.args.positive === (kind === "positive"));
      const entries = await Promise.all(
        filtered.map(async (l) => {
          const block = await provider.getBlock(l.blockNumber);
          const batch = await contract.getBatch(l.args.id);
          return {
            rater: l.args.rater,
            batchCode: batch.batchCode,
            timestamp: block.timestamp,
          };
        })
      );
      entries.sort((a, b) => b.timestamp - a.timestamp);
      setRatingList({ kind, entries });
    } catch (err) {
      console.error(err);
    } finally {
      setRatingLoading(false);
    }
  };

  return (
    <div style={cardStyle}>
      <h2>Welcome, {session.username}!</h2>
      <p style={{ color: "#aaa", textAlign: "left" }}>
        You're signed in as a <strong style={{ color: "#a78bfa" }}>{session.role}</strong>, based in{" "}
        {session.city}.
      </p>
      <p style={{ color: "#888", fontSize: "14px", textAlign: "left" }}>
        Use the panel on the left to {ROLE_WELCOME_HINT[role] || "manage your batches"}. You can also
        look up the full history of any batch-yours or anyone else's from Batch History, using just
        its batch code.
      </p>

      {stats && (
        <div style={{ textAlign: "left", marginTop: "16px" }}>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "12px" }}>
            <StatBox label="Total Registered" value={stats.totalRegistered} />
            <StatBox label="Delivered" value={stats.totalDelivered} />
            <StatBox label="Pending / Not Delivered" value={stats.totalNotDelivered} />
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              style={{ ...buttonStyle, backgroundColor: "#16a34a" }}
              onClick={() => showRatingList("positive")}
            >
               Positive Ratings ({stats.positive})
            </button>
            <button
              style={{ ...buttonStyle, backgroundColor: "#dc2626" }}
              onClick={() => showRatingList("negative")}
            >
               Negative Ratings ({stats.negative})
            </button>
          </div>

          {ratingLoading && <p style={{ marginTop: "12px" }}>Loading...</p>}

          {ratingList && !ratingLoading && (
            <div style={{ marginTop: "14px" }}>
              <h3 style={{ color: ratingList.kind === "positive" ? "#86efac" : "#fca5a5" }}>
                {ratingList.kind === "positive" ? "Positive" : "Negative"} Ratings Received
              </h3>
              {ratingList.entries.length === 0 && (
                <p style={{ color: "#888" }}>No {ratingList.kind} ratings yet.</p>
              )}
              {ratingList.entries.map((e, i) => (
                <div key={i} style={{ ...batchRowStyle, cursor: "default" }}>
                  <strong>{e.batchCode}</strong>
                  <p style={{ margin: "6px 0 0 0", fontSize: "13px", color: "#888" }}>
                    Rated by <small style={{ color: "#666" }}>{e.rater}</small> on{" "}
                    {formatBlockchainTime(e.timestamp)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value }) {
  return (
    <div style={{ ...readonlyBoxStyle, flex: "1 1 100px", textAlign: "center", marginBottom: 0 }}>
      <div style={{ fontSize: "22px", fontWeight: "bold" }}>{value}</div>
      <div style={{ fontSize: "12px", color: "#888" }}>{label}</div>
    </div>
  );
}

// ============================================================
// NEW: RegisteredBatchesPanel — the manufacturer's own separate
// "Registered Batches" sidebar page, with sort controls (time /
// quantity / highest product rating / lowest product rating). Rendered
// as checkbox-styled toggles per the brief; only one is ever active at
// a time (checking one clears the others), functioning as a single
// sort choice rather than a compound multi-key sort.
// ============================================================
const SORT_OPTIONS = [
  { key: "time", label: "Time (newest first)" },
  { key: "quantity", label: "Quantity (highest first)" },
  { key: "ratingHigh", label: "Highest Rating" },
  { key: "ratingLow", label: "Lowest Rating" },
];

function RegisteredBatchesPanel({ walletAddress }) {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState("time");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const contract = getReadOnlyContract();
        const provider = getProvider();
        const logs = await contract.queryFilter(contract.filters.BatchRegistered(), 0, "latest");
        const mine = logs.filter((l) => l.args.owner.toLowerCase() === walletAddress.toLowerCase());

        const details = await Promise.all(
          mine.map(async (log) => {
            const id = log.args.id;
            const [batch, block] = await Promise.all([contract.getBatch(id), provider.getBlock(log.blockNumber)]);
            const ratingCount = Number(batch.ratingCount);
            const avgRating = ratingCount > 0 ? Number(batch.ratingSum) / ratingCount : null;
            return {
              id: id.toString(),
              batchCode: batch.batchCode,
              productName: batch.productName,
              quantity: Number(batch.quantity),
              avgRating,
              ratingCount,
              timestamp: block.timestamp,
            };
          })
        );
        if (!cancelled) setBatches(details);
      } catch (err) {
        if (!cancelled) setError(describeError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  const sorted = [...batches].sort((a, b) => {
    switch (sortKey) {
      case "quantity":
        return b.quantity - a.quantity;
      case "ratingHigh":
        return (b.avgRating ?? -1) - (a.avgRating ?? -1);
      case "ratingLow":
        return (a.avgRating ?? 6) - (b.avgRating ?? 6);
      case "time":
      default:
        return b.timestamp - a.timestamp;
    }
  });

  return (
    <div style={cardStyle}>
      <h2>Registered Batches</h2>

      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "16px", textAlign: "left" }}>
        {SORT_OPTIONS.map((opt) => (
          <label key={opt.key} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#ccc", cursor: "pointer" }}>
            <input type="checkbox" checked={sortKey === opt.key} onChange={() => setSortKey(opt.key)} />
            {opt.label}
          </label>
        ))}
      </div>

      {loading && <p>Loading batches from the chain...</p>}
      {error && <p style={{ color: "#fca5a5" }}>{error}</p>}
      {!loading && !error && sorted.length === 0 && (
        <p style={{ color: "#888" }}>You haven't registered any batches yet.</p>
      )}

      {sorted.map((b) => (
        <div key={b.id} style={batchRowStyle}>
          <strong>{b.batchCode}</strong> <span style={{ color: "#888", fontSize: "13px" }}>(ID {b.id})</span>
          <p style={{ margin: "6px 0" }}>{b.productName} · Qty {b.quantity}</p>
          <p style={{ margin: 0, fontSize: "13px", color: "#888" }}>
            Registered: {formatBlockchainTime(b.timestamp)}
            {" · "}
            Rating: {b.avgRating !== null ? `${b.avgRating.toFixed(1)} / 5 (${b.ratingCount})` : "No ratings yet"}
          </p>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// NEW: MyBatchesPanel — "all the batches this account is involved
// with", shown on the Register Batch page (mode="registered": batches
// this Manufacturer created) and the Ownership Transfer page
// (mode="received": batches ever transferred TO this Transporter or
// Distributor). Sorted newest-first. Clicking a row expands its full
// history inline via BatchTimelineView, reusing the exact same
// timeline logic as the Fetch Batch page.
// ============================================================
function MyBatchesPanel({ mode, walletAddress, title, emptyText }) {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const contract = getReadOnlyContract();
        const provider = getProvider();

        let matchingLogs;
        if (mode === "registered") {
          const logs = await contract.queryFilter(contract.filters.BatchRegistered(), 0, "latest");
          matchingLogs = logs.filter((l) => l.args.owner.toLowerCase() === walletAddress.toLowerCase());
        } else {
          // "received": every batch ever transferred TO this address —
          // covers both what they're still holding and what they've
          // already forwarded on, since each stage only happens once
          // per batch in this supply chain.
          const logs = await contract.queryFilter(contract.filters.OwnershipTransferred(), 0, "latest");
          matchingLogs = logs.filter((l) => l.args.to.toLowerCase() === walletAddress.toLowerCase());
        }

        const details = await Promise.all(
          matchingLogs.map(async (log) => {
            const id = log.args.id;
            const [batch, block] = await Promise.all([contract.getBatch(id), provider.getBlock(log.blockNumber)]);
            return {
              id: id.toString(),
              batchCode: batch.batchCode,
              productName: batch.productName,
              quantity: batch.quantity.toString(),
              manufactureDate: batch.manufactureDate.toString(),
              expiryDate: batch.expiryDate.toString(),
              deliveryStatus: Number(batch.deliveryStatus),
              eventTimestamp: block.timestamp,
            };
          })
        );

        details.sort((a, b) => b.eventTimestamp - a.eventTimestamp);
        if (!cancelled) setBatches(details);
      } catch (err) {
        if (!cancelled) setError(describeError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [mode, walletAddress]);

  return (
    <div style={cardStyle}>
      <h2>{title}</h2>
      {loading && <p>Loading batches from the chain...</p>}
      {error && <p style={{ color: "#fca5a5" }}>{error}</p>}
      {!loading && !error && batches.length === 0 && <p style={{ color: "#888" }}>{emptyText}</p>}

      {batches.map((b) => {
        const isSelected = selectedId === b.id;
        return (
          <div key={b.id}>
            <div
              style={{ ...batchRowStyle, ...(isSelected ? batchRowActiveStyle : {}) }}
              onClick={() => setSelectedId(isSelected ? null : b.id)}
            >
              <strong>{b.batchCode}</strong>{" "}
              <span style={{ color: "#888", fontSize: "13px" }}>(ID {b.id})</span>
              <p style={{ margin: "6px 0" }}>
                {b.productName} · Qty {b.quantity}
              </p>
              <p style={{ margin: 0, fontSize: "13px", color: "#888" }}>
                {mode === "registered" ? "Registered" : "Received"}: {formatBlockchainTime(b.eventTimestamp)}
                {" · "}
                Status: {DELIVERY_STATUS_LABELS[b.deliveryStatus]}
              </p>
              <p style={{ margin: "6px 0 0 0", fontSize: "12px", color: "#a78bfa" }}>
                {isSelected ? "▲ Hide history" : "▼ Click to view history"}
              </p>
            </div>
            {isSelected && (
              <div style={{ marginLeft: "10px", marginBottom: "16px" }}>
                <BatchTimelineView batchId={b.id} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// NEW: PharmacyBatchesPanel — Pharmacy's equivalent of MyBatchesPanel,
// but split into Delivered / Not Delivered tabs (per the brief), with
// a quick "Mark as Delivered" action right on each not-delivered row
// so the pharmacy doesn't have to separately look up the batch code
// again just to update its status.
// ============================================================
function PharmacyBatchesPanel({ session, onDone }) {
  const { walletAddress } = session;
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("not-delivered"); // "not-delivered" | "delivered"
  const [selectedId, setSelectedId] = useState(null);
  const [actioningId, setActioningId] = useState(null);
  const [actionMessage, setActionMessage] = useState({ type: "", text: "" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const contract = getReadOnlyContract();
        const provider = getProvider();
        const logs = await contract.queryFilter(contract.filters.OwnershipTransferred(), 0, "latest");
        const matchingLogs = logs.filter((l) => l.args.to.toLowerCase() === walletAddress.toLowerCase());

        const details = await Promise.all(
          matchingLogs.map(async (log) => {
            const id = log.args.id;
            const [batch, block] = await Promise.all([contract.getBatch(id), provider.getBlock(log.blockNumber)]);
            return {
              id: id.toString(),
              batchCode: batch.batchCode,
              productName: batch.productName,
              quantity: batch.quantity.toString(),
              manufactureDate: batch.manufactureDate.toString(),
              expiryDate: batch.expiryDate.toString(),
              deliveryStatus: Number(batch.deliveryStatus),
              eventTimestamp: block.timestamp,
            };
          })
        );

        details.sort((a, b) => b.eventTimestamp - a.eventTimestamp);
        if (!cancelled) setBatches(details);
      } catch (err) {
        if (!cancelled) setError(describeError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  const markDelivered = async (batchId, delivered) => {
    setActioningId(batchId);
    setActionMessage({ type: "", text: "" });
    try {
      const contract = await getMetaMaskContract();
      setActionMessage({ type: "pending", text: "Sending transaction..." });
      const tx = await contract.markDelivered(batchId, delivered);
      setActionMessage({ type: "pending", text: "Waiting for confirmation..." });
      await tx.wait();
      setActionMessage({
        type: "success",
        text: `Batch marked as ${delivered ? "Delivered" : "Not Delivered"}.`,
      });
      setBatches((prev) =>
        prev.map((b) => (b.id === batchId ? { ...b, deliveryStatus: delivered ? 1 : 2 } : b))
      );
      onDone?.();
    } catch (err) {
      console.error(err);
      setActionMessage({ type: "error", text: describeError(err) });
    } finally {
      setActioningId(null);
    }
  };

  const delivered = batches.filter((b) => b.deliveryStatus === 1);
  const notDelivered = batches.filter((b) => b.deliveryStatus !== 1);
  const shown = tab === "delivered" ? delivered : notDelivered;

  return (
    <div style={cardStyle}>
      <h2>My Batches</h2>
      <p style={{ fontSize: "13px", color: "#888", marginTop: "-8px" }}>
        Every batch a Distributor has transferred to you. Mark each one Delivered once it's been
        dispensed to a patient.
      </p>

      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        <button
          style={{ ...tabButtonStyle, ...(tab === "not-delivered" ? tabActiveStyle : {}) }}
          onClick={() => setTab("not-delivered")}
        >
          Not Delivered ({notDelivered.length})
        </button>
        <button
          style={{ ...tabButtonStyle, ...(tab === "delivered" ? tabActiveStyle : {}) }}
          onClick={() => setTab("delivered")}
        >
          Delivered ({delivered.length})
        </button>
      </div>

      {loading && <p>Loading batches from the chain...</p>}
      {error && <p style={{ color: "#fca5a5" }}>{error}</p>}
      {!loading && !error && shown.length === 0 && (
        <p style={{ color: "#888" }}>
          {tab === "delivered" ? "No batches marked delivered yet." : "Nothing waiting on delivery right now."}
        </p>
      )}

      {shown.map((b) => {
        const isSelected = selectedId === b.id;
        return (
          <div key={b.id}>
            <div
              style={{ ...batchRowStyle, ...(isSelected ? batchRowActiveStyle : {}) }}
              onClick={() => setSelectedId(isSelected ? null : b.id)}
            >
              <strong>{b.batchCode}</strong>{" "}
              <span style={{ color: "#888", fontSize: "13px" }}>(ID {b.id})</span>
              <p style={{ margin: "6px 0" }}>
                {b.productName} · Qty {b.quantity}
              </p>
              <p style={{ margin: 0, fontSize: "13px", color: "#888" }}>
                Received: {formatBlockchainTime(b.eventTimestamp)} · Status:{" "}
                <strong style={{ color: b.deliveryStatus === 1 ? "#86efac" : "#fca5a5" }}>
                  {DELIVERY_STATUS_LABELS[b.deliveryStatus]}
                </strong>
              </p>
              <p style={{ margin: "6px 0 0 0", fontSize: "12px", color: "#a78bfa" }}>
                {isSelected ? "▲ Hide history" : "▼ Click to view history"}
              </p>
            </div>

            {tab === "not-delivered" && (
              <div style={{ display: "flex", gap: "10px", margin: "-2px 0 16px 0" }}>
                <button
                  disabled={actioningId === b.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    markDelivered(b.id, true);
                  }}
                  style={{ ...buttonStyle, backgroundColor: "#16a34a", width: "auto", padding: "8px 16px", flex: "none" }}
                >
                  {actioningId === b.id ? "Processing..." : "Mark as Delivered"}
                </button>
                <button
                  disabled={actioningId === b.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    markDelivered(b.id, false);
                  }}
                  style={{ ...buttonStyle, backgroundColor: "#dc2626", width: "auto", padding: "8px 16px", flex: "none" }}
                >
                  Mark as Not Delivered
                </button>
              </div>
            )}

            {isSelected && (
              <div style={{ marginLeft: "10px", marginBottom: "16px" }}>
                <BatchTimelineView batchId={b.id} />
              </div>
            )}
          </div>
        );
      })}

      <MessageBox message={actionMessage} />
    </div>
  );
}


function RegisterBatchCard({ session, onDone }) {
  const [productName, setProductName] = useState("");
  const [batchCode, setBatchCode] = useState("");
  const [quantity, setQuantity] = useState("");
  const [manufactureDate, setManufactureDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [confirming, setConfirming] = useState(false);
  // NEW: kept around after the form clears, so the QR code (which
  // encodes this batch's code) still has something to render.
  const [registeredCode, setRegisteredCode] = useState(null);

  const validate = () => {
    if (!productName.trim() || !batchCode.trim() || !quantity || !manufactureDate || !expiryDate) {
      return "Please fill in every field, including manufacture and expiry dates.";
    }
    if (Number(quantity) <= 0) {
      return "Quantity must be greater than zero.";
    }
    if (dateStringToUnix(expiryDate) <= dateStringToUnix(manufactureDate)) {
      return "Expiry date must be after the manufacture date.";
    }
    return null;
  };

  const openConfirm = () => {
    setMessage({ type: "", text: "" });
    const validationError = validate();
    if (validationError) {
      setMessage({ type: "error", text: validationError });
      return;
    }
    setConfirming(true);
  };

  const actuallyRegister = async () => {
    setConfirming(false);
    try {
      setLoading(true);
      const contract = await getMetaMaskContract();
      setMessage({ type: "pending", text: "Sending transaction..." });
      const tx = await contract.registerBatch(
        productName.trim(),
        batchCode.trim(),
        quantity,
        dateStringToUnix(manufactureDate),
        dateStringToUnix(expiryDate)
      );
      setMessage({ type: "pending", text: "Waiting for confirmation..." });
      await tx.wait();
      setMessage({ type: "success", text: `Batch "${batchCode.trim()}" registered successfully!` });
      setRegisteredCode(batchCode.trim());
      setProductName("");
      setBatchCode("");
      setQuantity("");
      setManufactureDate("");
      setExpiryDate("");
      onDone?.();
    } catch (err) {
      console.error(err);
      setMessage({ type: "error", text: describeError(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={cardStyle}>
      <h2>Register Pharmaceutical Batch</h2>

      <label style={labelStyle}>Product Name</label>
      <input type="text" placeholder="e.g. Paracetamol" value={productName} onChange={(e) => setProductName(e.target.value)} style={inputStyle} />

      <label style={labelStyle}>Batch Code</label>
      <input type="text" placeholder="e.g. PARACETAMOL-001" value={batchCode} onChange={(e) => setBatchCode(e.target.value)} style={inputStyle} />

      <label style={labelStyle}>Quantity</label>
      <input type="number" placeholder="e.g. 100" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={inputStyle} />

      <label style={labelStyle}>Manufacture Date</label>
      <input type="date" value={manufactureDate} onChange={(e) => setManufactureDate(e.target.value)} style={inputStyle} />

      <label style={labelStyle}>Expiry Date</label>
      <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} style={inputStyle} />

      <label style={labelStyle}>Manufacturer</label>
      <div style={readonlyBoxStyle}>{session.username} - {session.role}</div>
      <p style={{ fontSize: "12px", color: "#888", marginTop: "-8px", marginBottom: "12px" }}>
        The manufacturer is always your signed-in account - it cannot be typed manually.
      </p>

      <button onClick={openConfirm} disabled={loading} style={buttonStyle}>
        {loading ? "Processing..." : "Register Batch"}
      </button>
      <MessageBox message={message} />

      {/* NEW: every batch, once registered, gets a QR code encoding its
          batch code — download it now to print on the box, or save a
          canonical copy to IPFS. */}
      {registeredCode && (
        <div style={{ marginTop: "16px", padding: "16px", borderRadius: "10px", border: "1px solid #333" }}>
          <p style={{ marginTop: 0, marginBottom: "12px", color: "#888", fontSize: "13px" }}>
            QR code for <strong style={{ color: "#ccc" }}>{registeredCode}</strong>
          </p>
          <QRCodeBox batchCode={registeredCode} />
        </div>
      )}

      {confirming && (
        <ConfirmAndSign
          summary={
            <>
              <strong>Register Batch</strong>
              <br />
              {productName.trim()} — {batchCode.trim()} (qty {quantity})
              <br />
              Manufacture: {manufactureDate} · Expiry: {expiryDate}
            </>
          }
          onConfirmed={actuallyRegister}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

function TransferOwnershipCard({ session, onDone }) {
  const [transferCode, setTransferCode] = useState("");
  const [transferBatch, setTransferBatch] = useState(null);
  const [ownerUser, setOwnerUser] = useState(null);
  const [selectedRecipient, setSelectedRecipient] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [confirming, setConfirming] = useState(false);
  // NEW: rate-the-previous-holder state (thumbs up/down), shown once
  // this participant has loaded a batch they currently hold.
  const [previousHolder, setPreviousHolder] = useState(null); // { address, user } | null
  const [alreadyRated, setAlreadyRated] = useState(false);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [ratingMessage, setRatingMessage] = useState({ type: "", text: "" });

  const resolveBatchIdFromInput = async (contract, input) => {
    const trimmed = input.trim();
    if (/^\d+$/.test(trimmed)) return trimmed;
    const id = await contract.getIdByCode(trimmed);
    if (id.toString() === "0") throw new Error("Batch does not exist");
    return id;
  };

  const loadBatch = async () => {
    setMessage({ type: "", text: "" });
    setTransferBatch(null);
    setSelectedRecipient(null);
    setPreviousHolder(null);
    setAlreadyRated(false);
    setRatingMessage({ type: "", text: "" });
    if (!transferCode.trim()) {
      setMessage({ type: "error", text: "Please enter a batch code or blockchain ID." });
      return;
    }
    try {
      const contract = getReadOnlyContract();
      const id = await resolveBatchIdFromInput(contract, transferCode);
      const data = await contract.getBatch(id);
      if (data.id.toString() === "0") {
        setMessage({ type: "error", text: "That batch code / ID does not exist." });
        return;
      }
      setTransferBatch({ id: data.id.toString(), batchCode: data.batchCode, currentOwner: data.currentOwner });
      setOwnerUser(await getUserByAddress(data.currentOwner));

      // NEW: if this participant is the current owner and someone
      // handed them this batch, offer to rate that handoff (once).
      if (data.currentOwner.toLowerCase() === session.walletAddress.toLowerCase() && data.lastTransferFrom !== "0x0000000000000000000000000000000000000000") {
        const rated = await contract.hasRatedTransferFrom(id, session.walletAddress);
        setAlreadyRated(rated);
        const holderUser = await getUserByAddress(data.lastTransferFrom);
        setPreviousHolder({ address: data.lastTransferFrom, user: holderUser });
      }
    } catch (err) {
      setMessage({ type: "error", text: describeError(err) });
    }
  };

  const submitRating = async (positive) => {
    if (!transferBatch) return;
    setRatingLoading(true);
    setRatingMessage({ type: "", text: "" });
    try {
      const contract = await getMetaMaskContract();
      const tx = await contract.rateParticipant(transferBatch.id, positive);
      await tx.wait();
      setAlreadyRated(true);
      setRatingMessage({ type: "success", text: `Rated ${formatUser(previousHolder.user, previousHolder.address)} ${positive ? "positively 👍" : "negatively 👎"}.` });
    } catch (err) {
      setRatingMessage({ type: "error", text: describeError(err) });
    } finally {
      setRatingLoading(false);
    }
  };

  const submit = async () => {
    if (!transferBatch || !selectedRecipient) {
      setMessage({ type: "error", text: "Load a batch and pick a recipient first." });
      return;
    }
    setMessage({ type: "", text: "" });
    setConfirming(true);
  };

  const actuallyTransfer = async () => {
    setConfirming(false);
    try {
      setLoading(true);
      const contract = await getMetaMaskContract();
      setMessage({ type: "pending", text: "Sending transaction..." });
      const tx = await contract.transferOwnership(transferBatch.id, selectedRecipient.walletAddress);
      setMessage({ type: "pending", text: "Waiting for confirmation..." });
      await tx.wait();
      setMessage({ type: "success", text: `Ownership transferred to ${selectedRecipient.username}.` });
      setTransferBatch((prev) => (prev ? { ...prev, currentOwner: selectedRecipient.walletAddress } : prev));
      setOwnerUser(selectedRecipient);
      setSelectedRecipient(null);
      onDone?.();
    } catch (err) {
      console.error(err);
      setMessage({ type: "error", text: describeError(err) });
    } finally {
      setLoading(false);
    }
  };

  const isCurrentOwner =
    transferBatch && transferBatch.currentOwner.toLowerCase() === session.walletAddress.toLowerCase();

  // NEW: the role this participant is allowed to transfer to, matching
  // the on-chain rule in SupplyChain.sol. Manufacturer -> Transporter,
  // Transporter -> Distributor, Distributor -> Pharmacy.
  const requiredRecipientRole = NEXT_ROLE[session.role];

  return (
    <div style={cardStyle}>
      <h2>Transfer Ownership</h2>
      <p style={{ fontSize: "13px", color: "#888", marginTop: "-8px" }}>
        As a {session.role}, you can only transfer to a {requiredRecipientRole}.
      </p>

      <label style={labelStyle}>Batch Code or ID</label>
      <input type="text" placeholder="e.g. PARACETAMOL-001" value={transferCode} onChange={(e) => setTransferCode(e.target.value)} style={inputStyle} />
      <button onClick={loadBatch} style={{ ...buttonStyle, marginBottom: "15px" }}>
        Load Batch
      </button>

      {transferBatch && (
        <>
          <p><strong>Batch:</strong> {transferBatch.batchCode}</p>
          <p>
            <strong>Current Owner:</strong><br />
            {formatUser(ownerUser, transferBatch.currentOwner)}<br />
            <small style={{ color: "#666" }}>{transferBatch.currentOwner}</small>
          </p>

          {/* NEW: rate whoever handed this batch to you, once, before
              (or instead of) sending it onward. */}
          {previousHolder && !alreadyRated && (
            <div style={{ ...readonlyBoxStyle, textAlign: "left" }}>
              <p style={{ margin: "0 0 8px 0" }}>
                Rate <strong>{formatUser(previousHolder.user, previousHolder.address)}</strong>, who handed
                you this batch:
              </p>
              <div style={{ display: "flex", gap: "10px" }}>
                <button style={{ ...buttonStyle, backgroundColor: "#16a34a" }} onClick={() => submitRating(true)} disabled={ratingLoading}>
                  👍 Positive
                </button>
                <button style={{ ...buttonStyle, backgroundColor: "#dc2626" }} onClick={() => submitRating(false)} disabled={ratingLoading}>
                  👎 Negative
                </button>
              </div>
              <MessageBox message={ratingMessage} />
            </div>
          )}
          {previousHolder && alreadyRated && (
            <p style={{ color: "#86efac", fontSize: "13px" }}>✓ You've already rated this handoff.</p>
          )}

          {!isCurrentOwner && (
            <p style={{ color: "#f59e0b", fontSize: "14px" }}>
              You ({session.username}) are not the current owner of this batch — the transaction will be
              rejected by the smart contract.
            </p>
          )}

          <label style={labelStyle}>Transfer To ({requiredRecipientRole} only)</label>
          <UserSearchSelect
            excludeUsername={session.username}
            roleFilter={requiredRecipientRole}
            onSelect={setSelectedRecipient}
          />

          <button onClick={submit} disabled={loading || !selectedRecipient} style={buttonStyle}>
            {loading ? "Processing..." : "Transfer Ownership"}
          </button>
        </>
      )}

      <MessageBox message={message} />

      {confirming && (
        <ConfirmAndSign
          summary={
            <>
              <strong>Transfer Ownership</strong>
              <br />
              Batch: {transferBatch?.batchCode}
              <br />
              To: {selectedRecipient?.username} ({selectedRecipient?.role})
            </>
          }
          onConfirmed={actuallyTransfer}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

// ============================================================
// NEW: ConsumerVerify — public, no-login, no-MetaMask flow for the
// patient/customer holding a tablet box.
// ============================================================
// Design notes (why it's built this way):
// - Reads (getReadOnlyContract) never need MetaMask — they always used
//   a plain JsonRpcProvider even before this change, so "check this
//   batch" was already MetaMask-free. This component just exposes that
//   to a consumer with no login step in front of it.
// - The only WRITE a consumer can trigger is submitting a rating, and
//   that's relayed by the backend (POST /rate-batch, see api.js) using
//   the backend's own wallet — so even that never opens MetaMask.
// - Expiry logic: if today's date is after the expiry date, the batch
//   is EXPIRED. Otherwise it's safe, and we show how many days remain
//   until the printed expiry date.
const RATING_LABELS = { 1: "Poor", 2: "Fair", 3: "Good", 4: "Very Good", 5: "Excellent" };

function ConsumerVerify({ onBack }) {
  const [batchCode, setBatchCode] = useState("");
  const [batch, setBatch] = useState(null);
  const [events, setEvents] = useState([]);
  const [resolved, setResolved] = useState({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  const [selectedStars, setSelectedStars] = useState(0);
  const [consumerName, setConsumerName] = useState("");
  const [consumerCity, setConsumerCity] = useState("");
  const [consumerFeedback, setConsumerFeedback] = useState("");
  const [ratingLoading, setRatingLoading] = useState(false);
  const [ratingMessage, setRatingMessage] = useState({ type: "", text: "" });
  const [hasRated, setHasRated] = useState(false);

  const resolveId = async (contract, input) => {
    const trimmed = input.trim();
    if (/^\d+$/.test(trimmed)) return trimmed;
    const id = await contract.getIdByCode(trimmed);
    if (id.toString() === "0") throw new Error("Batch does not exist");
    return id;
  };

  // Shared by the initial verify AND by "refresh after rating", so the
  // new RatingSubmitted event shows up in the timeline right away.
  const loadEverything = async (codeToLoad) => {
    const contract = getReadOnlyContract();
    const provider = getProvider();

    const id = await resolveId(contract, codeToLoad);
    const data = await contract.getBatch(id);
    if (data.id.toString() === "0") {
      throw new Error("That batch code does not exist. Double-check the code on the box.");
    }

    const nowSeconds = Date.now() / 1000;
    const expiry = Number(data.expiryDate);
    const isExpired = expiry > 0 && nowSeconds > expiry;
    const daysRemaining = expiry > 0 ? Math.floor((expiry - nowSeconds) / 86400) : null;
    const ratingCount = Number(data.ratingCount);
    const ratingSum = Number(data.ratingSum);

    setBatch({
      id: data.id.toString(),
      batchCode: data.batchCode,
      productName: data.productName,
      manufactureDate: data.manufactureDate.toString(),
      expiryDate: data.expiryDate.toString(),
      deliveryStatus: Number(data.deliveryStatus),
      isExpired,
      daysRemaining,
      ratingCount,
      averageRating: ratingCount > 0 ? ratingSum / ratingCount : null,
    });

    // Full history timeline, same idea as BatchHistory.jsx, but also
    // pulling in RatingSubmitted events so a rating shows up here too.
    const [registeredLogs, transferredLogs, deliveryLogs, ratingLogs] = await Promise.all([
      contract.queryFilter(contract.filters.BatchRegistered(), 0, "latest"),
      contract.queryFilter(contract.filters.OwnershipTransferred(), 0, "latest"),
      contract.queryFilter(contract.filters.DeliveryStatusUpdated(), 0, "latest"),
      contract.queryFilter(contract.filters.RatingSubmitted(), 0, "latest"),
    ]);
    const relevant = [...registeredLogs, ...transferredLogs, ...deliveryLogs, ...ratingLogs].filter(
      (log) => log.args.id.toString() === id.toString()
    );
    const withBlocks = await Promise.all(
      relevant.map(async (log) => {
        const block = await provider.getBlock(log.blockNumber);
        return {
          type: log.eventName,
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
    setEvents(withBlocks);

    const uniqueAddresses = [...new Set(withBlocks.flatMap((e) => [e.from, e.to]).filter(Boolean))];
    const lookups = await Promise.all(
      uniqueAddresses.map(async (addr) => [addr.toLowerCase(), await getUserByAddress(addr)])
    );
    setResolved(Object.fromEntries(lookups.filter(([, u]) => u !== null)));
  };

  const verify = async () => {
    setMessage({ type: "", text: "" });
    setBatch(null);
    setEvents([]);
    setHasRated(false);
    setSelectedStars(0);
    setConsumerName("");
    setConsumerCity("");
    setConsumerFeedback("");
    setRatingMessage({ type: "", text: "" });

    if (!batchCode.trim()) {
      setMessage({ type: "error", text: "Please enter the batch code printed on the back of the box." });
      return;
    }
    try {
      setLoading(true);
      await loadEverything(batchCode);
    } catch (err) {
      console.error(err);
      setMessage({ type: "error", text: describeError(err) });
    } finally {
      setLoading(false);
    }
  };

  const submitStarRating = async () => {
    if (!batch || !selectedStars) return;
    if (!consumerCity.trim()) {
      setRatingMessage({ type: "error", text: "Please select your city — it's required." });
      return;
    }
    setRatingLoading(true);
    setRatingMessage({ type: "pending", text: "Submitting your rating..." });
    try {
      await rateBatch(batch.batchCode, {
        rating: selectedStars,
        name: consumerName.trim(),
        city: consumerCity.trim(),
        feedback: consumerFeedback.trim(),
      });
      setRatingMessage({ type: "success", text: "Thanks — your rating and feedback have been recorded." });
      setHasRated(true);
      // Refresh so the new RatingSubmitted event appears in history and
      // the average rating updates, per the brief.
      await loadEverything(batch.batchCode);
    } catch (err) {
      setRatingMessage({ type: "error", text: err.message || "Could not submit rating." });
    } finally {
      setRatingLoading(false);
    }
  };

  const eventLabels = {
    BatchRegistered: "BATCH REGISTERED",
    OwnershipTransferred: "OWNERSHIP TRANSFERRED",
    DeliveryStatusUpdated: "DELIVERY STATUS UPDATED",
    RatingSubmitted: "CONSUMER RATING",
  };

  return (
    <div style={heroFloatingLightCardStyle}>
      <h2 style={{ color: "#0f172a" }}>Verify a Tablet</h2>
      <p style={{ fontSize: "13px", color: "#64748b", marginTop: "-8px" }}>
        No account needed. Enter the batch code printed on the back of the tablet box to check
        whether it's genuine and see its full journey.
      </p>

      <label style={{ ...labelStyle, color: "#0f172a", fontWeight: "600" }}>Batch Code</label>
      <BatchCodeInput
        value={batchCode}
        onChange={setBatchCode}
        placeholder="e.g. PARACETAMOL-001"
        style={inputStyle}
        onKeyDown={(e) => e.key === "Enter" && verify()}
      />
      <button onClick={verify} disabled={loading} style={{ ...buttonStyle, backgroundColor: "#16a34a" }}>
        {loading ? "Checking..." : "Verify"}
      </button>
      <MessageBox message={message} />

      {batch && (
        <>
          <div
            style={{
              ...detailsCardStyle,
              backgroundColor: batch.isExpired ? "#450a0a" : "#052e16",
              border: `1px solid ${batch.isExpired ? "#dc2626" : "#16a34a"}`,
              color: batch.isExpired ? "#fca5a5" : "#86efac",
            }}
          >
            {batch.isExpired ? (
              <p style={{ margin: 0, fontWeight: "bold", fontSize: "16px" }}>
                ⚠ This batch EXPIRED on {formatDateOnly(batch.expiryDate)}. Do not use — return it to
                where you bought it.
              </p>
            ) : (
              <p style={{ margin: 0, fontWeight: "bold", fontSize: "16px" }}>
                ✓ Safe to use — valid for {batch.daysRemaining} more day{batch.daysRemaining === 1 ? "" : "s"},
                until {formatDateOnly(batch.expiryDate)}.
              </p>
            )}
          </div>

          <div style={{ ...detailsCardStyle, marginTop: "12px" }}>
            <h3 style={{ marginTop: 0, color: "#6c2bd9" }}>{batch.batchCode}</h3>
            <p><strong>Product:</strong> {batch.productName}</p>
            <p><strong>Manufacture Date:</strong> {formatDateOnly(batch.manufactureDate)}</p>
            <p><strong>Expiry Date:</strong> {formatDateOnly(batch.expiryDate)}</p>
            <p><strong>Delivery Status:</strong> {DELIVERY_STATUS_LABELS[batch.deliveryStatus]}</p>
            <p>
              <strong>Consumer Rating:</strong>{" "}
              {batch.ratingCount > 0
                ? `${batch.averageRating.toFixed(1)} / 5 (${batch.ratingCount} rating${batch.ratingCount === 1 ? "" : "s"})`
                : "No ratings yet — be the first!"}
            </p>
          </div>

          {/* ===== Rating + feedback widget ===== */}
          {/* Gated on delivery: a real consumer only has this tablet in
              hand once the pharmacy dispensed it, so rating/feedback is
              hidden (with an explanation) until deliveryStatus is
              Delivered. The contract enforces this too — this is just
              the friendly version of that same rule. */}
          <div style={{ ...detailsCardStyle, marginTop: "12px" }}>
            <h3 style={{ marginTop: 0, color: "#6c2bd9" }}>Rate & Give Feedback</h3>
            {batch.deliveryStatus !== 1 ? (
              <p style={{ color: "#f59e0b", fontSize: "14px" }}>
                Rating and feedback aren't available yet — they open up once the pharmacy marks this
                batch as delivered.
              </p>
            ) : (
              <>
                <p style={{ fontSize: "13px", color: "#555", marginTop: "-6px" }}>
                  Your rating and feedback help the manufacturer know how this batch performed.
                </p>
                <div style={{ display: "flex", gap: "6px", marginBottom: "10px" }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => setSelectedStars(n)}
                      disabled={ratingLoading}
                      style={{
                        fontSize: "26px",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: n <= selectedStars ? "#f59e0b" : "#ccc",
                        padding: 0,
                      }}
                      aria-label={`${n} star${n === 1 ? "" : "s"}`}
                    >
                      ★
                    </button>
                  ))}
                  {selectedStars > 0 && (
                    <span style={{ alignSelf: "center", marginLeft: "6px", color: "#555" }}>
                      {RATING_LABELS[selectedStars]}
                    </span>
                  )}
                </div>

                <label style={labelStyle}>Your Name (optional)</label>
                <input
                  type="text"
                  placeholder="Leave blank to stay anonymous"
                  value={consumerName}
                  onChange={(e) => setConsumerName(e.target.value)}
                  disabled={ratingLoading}
                  style={inputStyle}
                />

                <label style={labelStyle}>Your City (required)</label>
                <select
                  value={consumerCity}
                  onChange={(e) => setConsumerCity(e.target.value)}
                  disabled={ratingLoading}
                  style={inputStyle}
                >
                  <option value="">-- Select City --</option>
                  {INDIAN_CITIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                <label style={labelStyle}>Feedback (optional)</label>
                <textarea
                  placeholder="Anything you'd like the manufacturer to know?"
                  value={consumerFeedback}
                  onChange={(e) => setConsumerFeedback(e.target.value)}
                  disabled={ratingLoading}
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" }}
                />

                <button
                  onClick={submitStarRating}
                  disabled={!selectedStars || !consumerCity.trim() || ratingLoading}
                  style={buttonStyle}
                >
                  {ratingLoading ? "Submitting..." : hasRated ? "Update Rating" : "Submit Rating"}
                </button>
              </>
            )}
            <MessageBox message={ratingMessage} />
          </div>

          {/* ===== History timeline ===== */}
          {events.length > 0 && (
            <div style={{ marginTop: "20px", textAlign: "left" }}>
              <h3 style={{ color: "#6c2bd9", marginBottom: "8px" }}>Full History</h3>
              {events.map((e, i) => {
                const d = new Date(Number(e.timestamp) * 1000);
                const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
                const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
                const fromUser = e.from ? resolved[e.from.toLowerCase()] : null;
                const toUser = e.to ? resolved[e.to.toLowerCase()] : null;
                return (
                  <div key={i} style={{ background: "#161616", border: "1px solid #333", borderRadius: "8px", padding: "14px", marginBottom: "10px" }}>
                    <p style={{ margin: "0 0 8px 0", fontWeight: "bold", color: "#e5e5e5" }}>
                      {i + 1}. {eventLabels[e.type] || e.type}
                    </p>

                    {e.type === "BatchRegistered" && (
                      <p style={{ margin: 0, color: "#ccc" }}>
                        Registered by {toUser ? `${toUser.username} (${toUser.role})` : shortenAddressFallback(e.to)}
                      </p>
                    )}
                    {e.type === "OwnershipTransferred" && (
                      <p style={{ margin: 0, color: "#ccc" }}>
                        {fromUser ? `${fromUser.username} (${fromUser.role})` : shortenAddressFallback(e.from)} →{" "}
                        {toUser ? `${toUser.username} (${toUser.role})` : shortenAddressFallback(e.to)}
                      </p>
                    )}
                    {e.type === "DeliveryStatusUpdated" && (
                      <p style={{ margin: 0 }}>
                        <strong style={{ color: e.status === 1 ? "#86efac" : "#fca5a5" }}>
                          {DELIVERY_STATUS_LABELS[e.status]}
                        </strong>
                        {" "}by {toUser ? `${toUser.username} (${toUser.role})` : shortenAddressFallback(e.to)}
                      </p>
                    )}
                    {e.type === "RatingSubmitted" && (
                      <div>
                        <p style={{ margin: 0, color: "#f59e0b", fontSize: "18px" }}>
                          {"★".repeat(e.rating)}
                          {"☆".repeat(5 - e.rating)}{" "}
                          <span style={{ color: "#888", fontSize: "14px" }}>({e.rating}/5)</span>
                        </p>
                        <p style={{ margin: "6px 0 0 0", color: "#ccc" }}>
                          {e.name ? <strong>{e.name}</strong> : <span style={{ color: "#888" }}>Anonymous</span>}
                          {e.city && <span style={{ color: "#888" }}> — {e.city}</span>}
                        </p>
                        {e.feedback && (
                          <p style={{ margin: "8px 0 0 0", color: "#ddd", fontStyle: "italic" }}>"{e.feedback}"</p>
                        )}
                      </div>
                    )}

                    <p style={{ marginTop: "8px", marginBottom: 0, fontSize: "13px", color: "#888" }}>
                      {date} · {time}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <button style={{ ...buttonStyle, backgroundColor: "#333", marginTop: "18px" }} onClick={onBack}>
        Back
      </button>
    </div>
  );
}

// Local fallback (avoids importing shortenAddress just for this one spot
// in a way that could be confused with the resolved-user object).
function shortenAddressFallback(address) {
  if (!address || address.length < 10) return address || "—";
  return `${address.slice(0, 10)}...${address.slice(-6)}`;
}

const pageStyle = { padding: "40px", maxWidth: "700px", margin: "auto", fontFamily: "Arial" };
// NEW: the sidebar dashboard needs more horizontal room than the
// single-column 700px layout used everywhere else (landing, sign
// in/up, consumer verify) — this is the only view that uses it.
const dashboardPageStyle = { padding: "40px", maxWidth: "1180px", margin: "auto", fontFamily: "Arial" };
const titleStyle = { fontSize: "32px", marginBottom: "30px", color: "#6c2bd9" };
const cardStyle = { border: "1px solid #ccc", padding: "20px", borderRadius: "10px", marginBottom: "30px" };

// ============================================================
// NEW: "Hero" styles — the light, full-bleed background + gradient
// header + white role-picker card used by Landing, and the background
// (only) reused behind the Admin pages. See HeroBackdrop and Landing
// above.
// ============================================================
const heroBackdropStyle = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: -1,
  background: "linear-gradient(135deg, #eef2ff 0%, #f8fafc 45%, #eff6ff 100%)",
  overflow: "hidden",
};
const heroBlobTopLeftStyle = {
  position: "absolute",
  top: "-120px",
  left: "-120px",
  width: "340px",
  height: "340px",
  borderRadius: "50%",
  background: "radial-gradient(circle, rgba(59,130,246,0.16), transparent 70%)",
};
const heroBlobBottomRightStyle = {
  position: "absolute",
  bottom: "-140px",
  right: "-140px",
  width: "400px",
  height: "400px",
  borderRadius: "50%",
  background: "radial-gradient(circle, rgba(124,58,237,0.13), transparent 70%)",
};
const heroHexSvgStyle = {
  position: "fixed",
  top: "36px",
  right: "48px",
  width: "190px",
  height: "190px",
  overflow: "visible",
};
const heroVialCornerStyle = {
  position: "fixed",
  bottom: "-10px",
  left: "-10px",
  width: "220px",
  height: "260px",
  pointerEvents: "none",
};
const heroClipboardCornerStyle = {
  position: "fixed",
  bottom: "-10px",
  right: "-10px",
  width: "200px",
  height: "220px",
  pointerEvents: "none",
};
// A card that stays solidly dark regardless of what's behind it — used
// by AdminLogin/AdminDashboard so the new light HeroBackdrop only
// changes the page background around them, not their (unchanged)
// internal dark theme, text colors, or contrast.
const heroFloatingDarkCardStyle = {
  ...cardStyle,
  backgroundColor: "#161616",
  boxShadow: "0 20px 50px rgba(15,23,42,0.25)",
};
// A white card for pages that should look like the reference mockup
// (ConsumerVerify) rather than keep the app's dark theme — same idea as
// heroFloatingDarkCardStyle above, just the light variant.
const heroFloatingLightCardStyle = {
  ...cardStyle,
  backgroundColor: "#ffffff",
  color: "#0f172a",
  border: "1px solid #eef2f7",
  boxShadow: "0 20px 50px rgba(15,23,42,0.12)",
};
const heroAdminButtonStyle = {
  position: "fixed",
  top: "20px",
  right: "24px",
  padding: "9px 18px",
  borderRadius: "999px",
  border: "1px solid #dbeafe",
  backgroundColor: "#ffffff",
  color: "#1e3a8a",
  fontSize: "14px",
  fontWeight: "600",
  cursor: "pointer",
  boxShadow: "0 4px 14px rgba(15,23,42,0.08)",
};
const heroHeaderStyle = { textAlign: "center", marginBottom: "26px" };
const heroIconCircleStyle = {
  width: "72px",
  height: "72px",
  borderRadius: "50%",
  backgroundColor: "#eef2ff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  margin: "0 auto 14px",
  boxShadow: "0 8px 20px rgba(29,78,216,0.15)",
};
const heroTitleStyle = { fontSize: "32px", fontWeight: "800", margin: "0 0 10px 0" };
const heroTaglineStyle = {
  color: "#64748b",
  fontSize: "15px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "10px",
  margin: 0,
};
const heroDashStyle = { display: "inline-block", width: "28px", height: "1px", backgroundColor: "#cbd5e1" };
const heroCardStyle = {
  backgroundColor: "#ffffff",
  borderRadius: "16px",
  padding: "28px",
  maxWidth: "640px",
  margin: "0 auto",
  textAlign: "center",
  boxShadow: "0 20px 50px rgba(15,23,42,0.10)",
  border: "1px solid #eef2f7",
};
const heroUnderlineStyle = { width: "48px", height: "3px", backgroundColor: "#2563eb", borderRadius: "2px", margin: "0 auto 22px" };
const heroRoleCardStyle = {
  flex: "1 1 220px",
  border: "1px solid",
  borderRadius: "12px",
  padding: "22px 18px",
  textAlign: "center",
};
const heroRoleIconStyle = {
  width: "48px",
  height: "48px",
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "20px",
  margin: "0 auto",
};
const heroButtonStyle = {
  width: "100%",
  padding: "12px",
  borderRadius: "8px",
  border: "none",
  color: "white",
  fontSize: "15px",
  fontWeight: "600",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
};
const heroFooterRowStyle = {
  display: "flex",
  justifyContent: "center",
  gap: "28px",
  flexWrap: "wrap",
  marginTop: "22px",
  color: "#64748b",
  fontSize: "13px",
};
const heroFooterItemStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
};
// ============================================================
// NEW: Sign In / Register redesign — icon-prefixed inputs, checkbox
// rows, and the blue button/link styles used to match the reference
// mockup.
// ============================================================
const heroAuthHeaderStyle = { textAlign: "center", marginBottom: "18px" };
const heroAuthSubtitleStyle = { color: "#2563eb", fontSize: "13px", margin: "4px 0 22px", textAlign: "center" };
const heroFieldLabelStyle = { display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: "600", color: "#0f172a", textAlign: "left" };
const heroInputWrapperStyle = { position: "relative", marginBottom: "15px" };
const heroInputIconStyle = {
  position: "absolute",
  left: "12px",
  top: "50%",
  transform: "translateY(-50%)",
  display: "flex",
  pointerEvents: "none",
};
const heroInputRightToggleStyle = {
  position: "absolute",
  right: "10px",
  top: "50%",
  transform: "translateY(-50%)",
  display: "flex",
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
};
const heroCheckboxRowStyle = { display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#334155" };
const heroBlueButtonStyle = {
  ...heroButtonStyle,
  backgroundColor: "#2563eb",
  marginBottom: "6px",
};
const heroSwitchModeRowStyle = { textAlign: "center", fontSize: "13px", color: "#64748b", margin: "14px 0" };
const heroBlueLinkStyle = { color: "#2563eb", fontWeight: "600", background: "none", border: "none", cursor: "pointer", fontSize: "13px", padding: 0, textDecoration: "none" };
const heroLightBackButtonStyle = {
  width: "100%",
  padding: "12px",
  borderRadius: "8px",
  border: "1px solid #e2e8f0",
  backgroundColor: "#ffffff",
  color: "#0f172a",
  fontSize: "15px",
  fontWeight: "600",
  cursor: "pointer",
  marginTop: "6px",
};
const landingCardsRow = {
  display: "flex",
  gap: "16px",
  flexWrap: "wrap",
};

const labelStyle = { display: "block", marginBottom: "6px", fontSize: "14px", color: "#aaa" };
const linkButtonStyle = {
  background: "none",
  border: "none",
  color: "#a78bfa",
  fontSize: "14px",
  cursor: "pointer",
  textDecoration: "underline",
  padding: "4px 0",
  display: "block",
};
const inputStyle = {
  width: "100%",
  padding: "12px",
  marginBottom: "15px",
  borderRadius: "8px",
  border: "1px solid #ccc",
  fontSize: "16px",
  boxSizing: "border-box",
  // CHANGED: the page sets color-scheme: light dark (see index.css), so
  // browsers render native inputs in dark mode (near-black background,
  // barely-visible text) whenever the OS is set to dark — regardless of
  // what color the card around them is. Forcing light here keeps every
  // input readable on every card, light or dark.
  backgroundColor: "#ffffff",
  color: "#111827",
  colorScheme: "light",
};
const heroSelectStyle = { ...inputStyle, textAlign: "left" };
const readonlyBoxStyle = {
  width: "100%",
  padding: "12px",
  marginBottom: "8px",
  borderRadius: "8px",
  border: "1px solid #444",
  backgroundColor: "#1a1a1a",
  fontSize: "15px",
  boxSizing: "border-box",
};
const buttonStyle = {
  width: "100%",
  padding: "12px",
  borderRadius: "8px",
  border: "none",
  backgroundColor: "#6c2bd9",
  color: "white",
  fontSize: "16px",
  cursor: "pointer",
};
const tabButtonStyle = { ...buttonStyle, backgroundColor: "#333", flex: 1 };
const tabActiveStyle = { backgroundColor: "#6c2bd9" };

// NEW: Logout button pinned to the top-right of the whole dashboard,
// same placement pattern as the Admin button on the landing page.
const dashboardLogoutButtonStyle = {
  position: "absolute",
  top: "-46px",
  right: 0,
  padding: "8px 16px",
  borderRadius: "8px",
  border: "1px solid #444",
  backgroundColor: "#1a1a1a",
  color: "#fca5a5",
  fontSize: "14px",
  cursor: "pointer",
};

// NEW: WhatsApp-style narrow icon rail wrapping the sidebar nav buttons.
const sidebarIconRailStyle = {
  border: "1px solid #ccc",
  borderRadius: "10px",
  padding: "12px 6px",
  backgroundColor: "#111",
};
const batchRowStyle = {
  border: "1px solid #333",
  borderRadius: "8px",
  padding: "14px",
  marginBottom: "10px",
  cursor: "pointer",
  backgroundColor: "#161616",
  textAlign: "left",
};
const batchRowActiveStyle = { border: "1px solid #6c2bd9", backgroundColor: "#1e1530" };
const detailsCardStyle = {
  marginTop: "20px",
  textAlign: "left",
  background: "#f4f4f4",
  color: "#111",
  padding: "15px",
  borderRadius: "10px",
};
