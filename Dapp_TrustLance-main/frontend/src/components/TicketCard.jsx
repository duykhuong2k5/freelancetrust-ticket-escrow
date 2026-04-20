import { STATUS } from "../utils/status";
import { ethers } from "ethers";

function short(addr) {
  if (!addr || addr === ethers.ZeroAddress) return "Unclaimed";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function TicketCard({ ticket, onSelect }) {
  const s = STATUS[ticket.status];
  const deadlinePassed = Date.now() / 1000 > Number(ticket.deadline);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3 hover:shadow-md transition-shadow duration-200">
      <div className="flex justify-between items-start gap-3">
        <div className="space-y-2">
          <span className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full ${s.color}`}>
            {s.label}
          </span>

          {deadlinePassed && ticket.status < 4 && ticket.status !== 6 && (
            <span className="ml-2 px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700">
              ⏰ Overdue
            </span>
          )}

          <h3 className="font-semibold text-gray-800 leading-snug">
            {ticket.title || "Untitled Ticket"}
          </h3>
        </div>

        <span className="font-bold text-emerald-600 whitespace-nowrap">
          {ethers.formatEther(ticket.amount)} ETH
        </span>
      </div>

      <p className="text-xs text-gray-400 font-mono break-all">
        🎟 {ticket.address.slice(0, 8)}...{ticket.address.slice(-6)}
      </p>

      <div className="text-xs text-gray-600 space-y-1">
        <p>🏢 Company: {short(ticket.company)}</p>
        <p>👷 Worker: {short(ticket.worker)}</p>
        <p>
          📅 {new Date(ticket.deadline * 1000).toLocaleDateString()}{" "}
          <span className="text-gray-400">
            {new Date(ticket.deadline * 1000).toLocaleTimeString()}
          </span>
        </p>
      </div>

      <button
        onClick={() => onSelect(ticket.address)}
        className="w-full mt-1 bg-gray-900 hover:bg-gray-800 text-white py-2 rounded-lg text-sm font-medium transition-colors duration-200"
      >
        View Detail →
      </button>
    </div>
  );
}