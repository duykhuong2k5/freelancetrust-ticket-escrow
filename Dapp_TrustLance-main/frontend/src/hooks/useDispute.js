import { useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";

export function useDispute(multisig, ticketAddr, address) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [hasVoted, setHasVoted] = useState(false);
  const [resolved, setResolved] = useState(false);

  const [votesForWorker, setVotesForWorker] = useState(0);
  const [votesForCompany, setVotesForCompany] = useState(0);
  const [required, setRequired] = useState(0);

  const load = useCallback(async () => {
    if (!multisig || !address || !ticketAddr) return;

    try {
      const addr = ethers.getAddress(address);

      setHasVoted(await multisig.hasVoted(ticketAddr, addr));

      const [forWorker, forCompany, isResolved] =
        await multisig.getVotes(ticketAddr);

      setVotesForWorker(Number(forWorker));
      setVotesForCompany(Number(forCompany));
      setResolved(isResolved);

      const req = await multisig.required();
      setRequired(Number(req));
    } catch (e) {
      console.error("useDispute load error:", e);
    }
  }, [multisig, ticketAddr, address]);

  useEffect(() => {
    load();
  }, [load]);

  async function vote(payWorker) {
    try {
      setLoading(true);
      setError(null);

      const tx = await multisig.vote(ticketAddr, payWorker);
      await tx.wait();

      await load();
    } catch (e) {
      setError(e.reason || e.message);
    } finally {
      setLoading(false);
    }
  }

  return {
    vote,
    loading,
    error,
    hasVoted,
    resolved,
    votesForWorker,
    votesForCompany,
    required,
  };
}