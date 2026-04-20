import { useDispute } from "../hooks/useDispute";

export default function ArbiterPanel({
  multisig,
  ticketAddr,
  address,
}) {
  const {
    vote,
    loading,
    error,
    hasVoted,
    resolved,
    votesForWorker,
    votesForCompany,
    required,
  } = useDispute(multisig, ticketAddr, address);

  return (
    <div className="mt-6 border-2 border-amber-200 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 overflow-hidden">
      <div className="bg-amber-100 px-5 py-3 border-b border-amber-200">
        <h3 className="font-bold text-lg text-amber-900 flex items-center gap-2">
          <span className="text-2xl">⚖️</span>
          Arbiter Voting Panel
        </h3>
      </div>

      <div className="p-5 space-y-4">
        {resolved && (
          <div className="p-4 bg-green-100 text-green-800 rounded-lg border border-green-200 flex items-center gap-3">
            <span className="text-2xl">✅</span>
            <div>
              <p className="font-semibold">Dispute Resolved</p>
              <p className="text-sm text-green-700">The voting has concluded</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">💰</span>
              <span className="text-sm font-medium text-gray-600">Pay Worker</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-emerald-600">{votesForWorker}</span>
              <span className="text-gray-400">/</span>
              <span className="text-lg text-gray-500">{required}</span>
            </div>
            <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                style={{ width: `${required > 0 ? (votesForWorker / required) * 100 : 0}%` }}
              />
            </div>
          </div>

          <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">↩️</span>
              <span className="text-sm font-medium text-gray-600">Refund Company</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-red-600">{votesForCompany}</span>
              <span className="text-gray-400">/</span>
              <span className="text-lg text-gray-500">{required}</span>
            </div>
            <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-red-500 rounded-full transition-all duration-300"
                style={{ width: `${required > 0 ? (votesForCompany / required) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>

        {!resolved && !hasVoted && (
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              className="btn-success flex-1 py-3"
              disabled={loading}
              onClick={() => vote(true)}
            >
              <span className="flex items-center justify-center gap-2">
                <span>💰</span>
                Pay Worker
              </span>
            </button>

            <button
              className="btn-danger flex-1 py-3"
              disabled={loading}
              onClick={() => vote(false)}
            >
              <span className="flex items-center justify-center gap-2">
                <span>↩️</span>
                Refund Company
              </span>
            </button>
          </div>
        )}

        {hasVoted && !resolved && (
          <div className="p-4 bg-blue-50 text-blue-800 rounded-lg border border-blue-200 flex items-center gap-3">
            <span className="text-xl">🗳️</span>
            <div>
              <p className="font-medium">Vote Submitted</p>
              <p className="text-sm text-blue-600">
                You have already voted on this dispute. Waiting for other arbiters...
              </p>
            </div>
          </div>
        )}

        {loading && (
          <div className="p-4 bg-blue-50 text-blue-800 rounded-lg border border-blue-200 flex items-center gap-3">
            <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full"></div>
            <p className="font-medium">Submitting your vote...</p>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 text-red-800 rounded-lg border border-red-200 flex items-center gap-3">
            <span className="text-xl">❌</span>
            <div>
              <p className="font-medium">Error</p>
              <p className="text-sm text-red-600">{error}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}