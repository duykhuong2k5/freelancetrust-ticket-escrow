// MUST match TicketEscrow.sol
// enum Status { Open, Claimed, Submitted, Disputed, Paid, Refunded, Cancelled }

export const STATUS = [
  { label: "🆕 Open", color: "bg-blue-100 text-blue-700 border border-blue-200" },          // 0
  { label: "🎯 Claimed", color: "bg-amber-100 text-amber-700 border border-amber-200" },   // 1
  { label: "📤 Submitted", color: "bg-purple-100 text-purple-700 border border-purple-200" }, // 2
  { label: "⚠️ Disputed", color: "bg-red-100 text-red-700 border border-red-200" },        // 3
  { label: "💰 Paid", color: "bg-emerald-100 text-emerald-700 border border-emerald-200" }, // 4
  { label: "↩️ Refunded", color: "bg-gray-100 text-gray-700 border border-gray-200" },     // 5
  { label: "🛑 Cancelled", color: "bg-slate-100 text-slate-700 border border-slate-200" }, // 6
];