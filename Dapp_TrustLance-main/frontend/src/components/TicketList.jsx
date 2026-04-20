import TicketCard from "./TicketCard";

export default function TicketList({ tickets = [], onSelect }) {
  if (!tickets.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
        <div className="text-4xl mb-3">📭</div>
        <p className="text-gray-500 font-medium">No tickets found</p>
        <p className="text-gray-400 text-sm mt-1">
          Create a new ticket to get started
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-bold text-gray-800">🎫 Ticket Board</h2>
        <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
          {tickets.length} tickets
        </span>
      </div>

      <div className="space-y-3 max-h-[650px] overflow-y-auto pr-2">
        {tickets.map((ticket) => (
          <TicketCard
            key={ticket.address}
            ticket={ticket}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}