import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { STATUS } from "../utils/status";
import ArbiterPanel from "./ArbiterPanel";

function short(addr) {
  if (!addr || addr === ethers.ZeroAddress) return "—";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

export default function TicketDetail({
  escrow,
  multisig,
  ticket,
  address,
  arbiters,
  refresh,
}) {
  const s = STATUS[ticket.status];
  const [loading, setLoading] = useState(false);
  const [chainNow, setChainNow] = useState(0);
  const [actionError, setActionError] = useState(null);

  const [proofCIDInput, setProofCIDInput] = useState("");
  const [proofNoteInput, setProofNoteInput] = useState("");
  const [resubmissionReason, setResubmissionReason] = useState("");

  useEffect(() => {
    setProofCIDInput("");
    setProofNoteInput("");
    setResubmissionReason("");
    setActionError(null);
    console.log("Current address:", address);
    console.log("Company:", ticket.company);
  }, [ticket.address, address]);

  useEffect(() => {
    if (!window.ethereum) return;

    const provider = new ethers.BrowserProvider(window.ethereum);
    let mounted = true;

    async function tick() {
      try {
        const block = await provider.getBlock("latest");
        if (mounted) setChainNow(Number(block.timestamp));
      } catch (e) {
        console.error("Load chain time failed", e);
      }
    }

    tick();
    const id = setInterval(tick, 10000);

    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [ticket.address]);

  const isCompany =
    address?.toLowerCase() === ticket.company.toLowerCase();

  const isWorker =
    address?.toLowerCase() === ticket.worker.toLowerCase();

  const isArbiter = arbiters
    .map((a) => a.toLowerCase())
    .includes(address?.toLowerCase());

  const isOpen =
    ticket.status === 0 &&
    ticket.worker === ethers.ZeroAddress;

  const isClaimed = ticket.status === 1;
  const isSubmitted = ticket.status === 2;
  const isDisputed = ticket.status === 3;

  const deadlinePassed =
    chainNow > 0 && chainNow > ticket.deadline;

  async function handle(action, fn) {
    try {
      setLoading(true);
      setActionError(null);

      const tx = await fn();
      await tx.wait();
      await refresh();
    } catch (e) {
      console.error(action, e);
      setActionError(
        e.reason || e.data?.message || e.message || "Transaction failed"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-b border-gray-200">
        <h2 className="text-xl font-bold text-gray-800">🎫 Ticket Detail</h2>
      </div>

      <div className="p-6 space-y-5">
        <div className="flex flex-wrap gap-2 items-center">
          <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${s.color}`}>
            {s.label}
          </span>

          {deadlinePassed && ticket.status < 4 && ticket.status !== 6 && (
            <span className="px-3 py-1.5 bg-red-100 text-red-700 rounded-full text-sm font-medium animate-pulse">
              ⏰ Deadline Passed
            </span>
          )}
        </div>

        <div className="bg-gray-50 rounded-xl p-4 space-y-3">
          <div className="py-2 border-b border-gray-200">
            <span className="text-gray-500 font-medium block mb-1">📝 Title</span>
            <p className="font-semibold text-gray-800">{ticket.title}</p>
          </div>

          <div className="flex items-center justify-between py-2 border-b border-gray-200">
            <span className="text-gray-500 font-medium">🏢 Company</span>
            <span className="font-mono text-sm bg-white px-3 py-1 rounded-lg border">
              {short(ticket.company)}
            </span>
          </div>

          <div className="flex items-center justify-between py-2 border-b border-gray-200">
            <span className="text-gray-500 font-medium">👷 Worker</span>
            <span className="font-mono text-sm bg-white px-3 py-1 rounded-lg border">
              {ticket.worker === ethers.ZeroAddress
                ? <span className="text-gray-400 italic">Unclaimed</span>
                : short(ticket.worker)}
            </span>
          </div>

          <div className="flex items-center justify-between py-2 border-b border-gray-200">
            <span className="text-gray-500 font-medium">💰 Reward</span>
            <span className="text-lg font-bold text-emerald-600">
              {ethers.formatEther(ticket.amount)} ETH
            </span>
          </div>

          <div className="py-2 border-b border-gray-200">
            <span className="text-gray-500 font-medium block mb-1">🔗 Details CID</span>
            <p className="text-sm text-gray-700 break-all">
              {ticket.detailsCID || "—"}
            </p>
          </div>

          <div className="flex items-center justify-between py-2 border-b border-gray-200">
            <span className="text-gray-500 font-medium">📅 Deadline</span>
            <span className="text-sm font-medium text-gray-700">
              {new Date(ticket.deadline * 1000).toLocaleString()}
            </span>
          </div>

          <div className="flex items-center justify-between py-2">
            <span className="text-gray-400 text-sm">⛓ Chain time</span>
            <span className="text-xs text-gray-400">
              {chainNow
                ? new Date(chainNow * 1000).toLocaleString()
                : "Loading..."}
            </span>
          </div>
        </div>

        {(ticket.proofCID || ticket.proofNote || ticket.rejectionReason) && (
          <div className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-200">
            <h3 className="font-semibold text-slate-800">📤 Submission Info</h3>

            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">Proof CID</p>
              <p className="text-sm text-gray-700 break-all">
                {ticket.proofCID || "—"}
              </p>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">Proof Note</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {ticket.proofNote || "—"}
              </p>
            </div>

            {ticket.rejectionReason && (
              <div>
                <p className="text-sm font-medium text-red-600 mb-1">Rejection Reason</p>
                <p className="text-sm text-red-700 whitespace-pre-wrap">
                  {ticket.rejectionReason}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="space-y-3">
          {isOpen && !isCompany && (
            <button
              disabled={loading}
              className="btn-primary w-full py-3"
              onClick={() => handle("CLAIM_TICKET", () => escrow.claimTicket())}
            >
              {loading ? "Processing..." : "🎯 Claim Ticket"}
            </button>
          )}

          {isOpen && isCompany && (
            <button
              disabled={loading}
              className="btn-danger w-full py-3"
              onClick={() => handle("CANCEL_TICKET", () => escrow.cancelOpenTicket())}
            >
              {loading ? "Processing..." : "🛑 Cancel Open Ticket"}
            </button>
          )}

          {isWorker && isClaimed && (
            <div className="space-y-3 bg-blue-50 border border-blue-200 rounded-xl p-4">
              <h3 className="font-semibold text-blue-900">📤 Submit Proof</h3>

              <input
                type="text"
                value={proofCIDInput}
                onChange={(e) => setProofCIDInput(e.target.value)}
                placeholder="ipfs://proof-cid"
                className="w-full px-4 py-2 border rounded-lg"
              />

              <textarea
                value={proofNoteInput}
                onChange={(e) => setProofNoteInput(e.target.value)}
                placeholder="Describe what was completed..."
                rows={4}
                className="w-full px-4 py-2 border rounded-lg"
              />

              <button
                disabled={loading}
                className="btn-success w-full py-3"
                onClick={() => {
                  if (!proofCIDInput.trim()) {
                    setActionError("Proof CID is required");
                    return;
                  }
                  handle("SUBMIT_PROOF", () =>
                    escrow.submitProof(proofCIDInput.trim(), proofNoteInput.trim())
                  );
                }}
              >
                {loading ? "Submitting..." : "📤 Submit Proof"}
              </button>
            </div>
          )}

          {isCompany && isSubmitted && (
            <div className="space-y-3">
              <div className={`p-3 rounded-lg text-sm border ${
                deadlinePassed
                  ? "bg-amber-50 border-amber-200 text-amber-800"
                  : "bg-blue-50 border-blue-200 text-blue-800"
              }`}>
                {deadlinePassed ? (
                  <>
                    <p className="font-medium">⏰ Worker submitted but deadline has passed</p>
                    <p className="mt-1">
                      You can still approve payment, request resubmission, or open dispute.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-medium">📤 Worker has submitted proof</p>
                    <p className="mt-1">
                      Review the result and either approve, request resubmission, or open dispute.
                    </p>
                  </>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  disabled={loading}
                  className="btn-success flex-1 py-3"
                  onClick={() =>
                    handle("APPROVE_SUBMISSION", async () => {
                      const provider = new ethers.BrowserProvider(window.ethereum);
                      const signer = await provider.getSigner();

                      const contract = escrow.connect(signer);
                      return contract.approveSubmission();
                    })
                  }
                >
                  {loading ? "Processing..." : "✅ Approve & Pay"}
                </button>

                <button
                  disabled={loading}
                  className="btn-danger flex-1 py-3"
                  onClick={() =>
                    handle("OPEN_DISPUTE", () => escrow.disputeByCompany())
                  }
                >
                  {loading ? "Processing..." : "⚠️ Open Dispute"}
                </button>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                <h3 className="font-semibold text-amber-900">🔁 Request Resubmission</h3>

                <textarea
                  value={resubmissionReason}
                  onChange={(e) => setResubmissionReason(e.target.value)}
                  placeholder="Explain what needs to be corrected..."
                  rows={3}
                  className="w-full px-4 py-2 border rounded-lg"
                />

                <button
                  disabled={loading}
                  className="btn-warning w-full py-3"
                  onClick={() => {
                    if (!resubmissionReason.trim()) {
                      setActionError("Resubmission reason is required");
                      return;
                    }
                    handle("REQUEST_RESUBMISSION", () =>
                      escrow.requestResubmission(resubmissionReason.trim())
                    );
                  }}
                >
                  {loading ? "Processing..." : "🔁 Request Resubmission"}
                </button>
              </div>
            </div>
          )}

          {isWorker && isSubmitted && deadlinePassed && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg text-sm border bg-amber-50 border-amber-200 text-amber-800">
                <p className="font-medium">⏰ Deadline passed and company has not responded</p>
                <p className="mt-1">
                  You can open a dispute for arbiter review.
                </p>
              </div>

              <button
                disabled={loading}
                className="btn-danger w-full py-3"
                onClick={() =>
                  handle("WORKER_DISPUTE", () => escrow.disputeByWorker())
                }
              >
                {loading ? "Processing..." : "⚠️ Open Dispute (No Response)"}
              </button>
            </div>
          )}
        </div>

        {actionError && (
          <div className="p-4 bg-red-50 text-red-800 rounded-lg border border-red-200">
            <p className="font-medium">Error</p>
            <p className="text-sm mt-1">{actionError}</p>
          </div>
        )}

        {isArbiter && isDisputed && (
          <ArbiterPanel
            multisig={multisig}
            ticketAddr={ticket.address}
            address={address}
          />
        )}
      </div>
    </div>
  );
}