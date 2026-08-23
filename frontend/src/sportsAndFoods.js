// frontend/src/sportsAndFoods.js
//
// Fixed option lists for the two security questions asked at Sign Up
// and re-asked (never pre-filled) during Forgot Password. Must match
// blockchain/server.js's SPORTS / INDIAN_FOODS exactly — the backend
// validates against the same lists, so a mismatch here would just
// produce a "please choose a valid option" error, not a security hole.

export const SPORTS = [
  "Cricket", "Football", "Badminton", "Hockey", "Tennis", "Kabaddi",
  "Chess", "Volleyball", "Basketball", "Table Tennis", "Wrestling", "Athletics",
];

export const INDIAN_FOODS = [
  "Biryani", "Dosa", "Butter Chicken", "Paneer Tikka", "Chole Bhature",
  "Idli Sambar", "Rajma Chawal", "Pav Bhaji", "Rogan Josh", "Dhokla",
  "Vada Pav", "Gulab Jamun", "Samosa", "Momos", "Poha",
];
