import { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";

import { connectWallet } from "./lib/ethereum";
import {
  getTicketBoard,
  getTicketEscrow,
  getMultiSig,
} from "./lib/contracts";

import CreateTicket from "./components/CreateTicket";
import TicketList from "./components/TicketList";
import TicketDetail from "./components/TicketDetail";

import {
  TICKET_BOARD_ADDRESS,
  MULTISIG_ADDRESS,
  CHAIN_ID,
} from "./config";

function App() {
  const [signer, setSigner] = useState(null);
  const [address, setAddress] = useState(null);

  const [board, setBoard] = useState(null);
  const [multisig, setMultisig] = useState(null);
  const [arbiters, setArbiters] = useState([]);

  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [ticketEscrow, setTicketEscrow] = useState(null);

  const [loadingTickets, setLoadingTickets] = useState(false);
  const [connectError, setConnectError] = useState(null);
  const [pageError, setPageError] = useState(null);

  const short = (addr) =>
    addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "—";

  async function connect() {
    try {
      setConnectError(null);

      const res = await connectWallet();
      if (!res) return;

      setSigner(res.signer);
      setAddress(res.address);
    } catch (e) {
      console.error("Connect wallet failed:", e);
      setConnectError(e?.message || "Failed to connect wallet");
    }
  }

  useEffect(() => {
    if (!signer) return;
    setBoard(getTicketBoard(signer));
  }, [signer]);

  useEffect(() => {
    if (!signer) return;

    async function initMultisig() {
      try {
        const m = getMultiSig(signer);
        setMultisig(m);

        const list = await m.getArbiters();
        setArbiters(list);
      } catch (e) {
        console.error("Load multisig/arbiters failed:", e);
        setArbiters([]);
      }
    }

    initMultisig();
  }, [signer]);

  const readTicket = useCallback(async (addr, runner) => {
    const t = getTicketEscrow(addr, runner);

    const [
      company,
      worker,
      title,
      detailsCID,
      amount,
      deadline,
      status,
      proofCID,
      proofNote,
      rejectionReason,
    ] = await Promise.all([
      t.company(),
      t.worker(),
      t.title(),
      t.detailsCID(),
      t.amount(),
      t.deadline(),
      t.status(),
      t.proofCID(),
      t.proofNote(),
      t.rejectionReason(),
    ]);
    // 🔥 THÊM LOG Ở ĐÂY
    console.log("📦 Ticket:", addr);
    console.log("👷 Worker:", worker);
    console.log("💰 Amount:", ethers.formatEther(amount));
    console.log("📊 Status:", Number(status));

    return {
      address: addr,
      company,
      worker,
      title,
      detailsCID,
      amount,
      deadline: Number(deadline),
      status: Number(status),
      proofCID,
      proofNote,
      rejectionReason,
    };
  }, []);

  const loadTickets = useCallback(async () => {
    if (!window.ethereum) return;
    if (!signer) return;

    try {
      setLoadingTickets(true);
      setPageError(null);

      const provider = new ethers.BrowserProvider(window.ethereum);
      const boardRead = getTicketBoard(provider);

      const ticketAddresses = await boardRead.getAllTickets();
      console.log("🔥 ticketAddresses:", ticketAddresses);

      const result = await Promise.all(
        ticketAddresses.map((addr) => readTicket(addr, provider))
      );

      setTickets(result);

      if (selectedTicket) {
        const freshSelected = result.find(
          (item) =>
            item.address.toLowerCase() === selectedTicket.address.toLowerCase()
        );

        if (
          freshSelected &&
          JSON.stringify(freshSelected) !== JSON.stringify(selectedTicket)
        ) {
          setSelectedTicket(freshSelected); // ✅ chỉ set khi khác
        }
      }
    } catch (e) {
      console.error("loadTickets failed:", e);
      setPageError(e?.reason || e?.message || "Failed to load tickets");
    } finally {
      setLoadingTickets(false);
    }
  }, [readTicket, selectedTicket, signer]);

  async function selectTicket(ticketAddress) {
    if (!signer) return;

    try {
      setPageError(null);

      const found =
        tickets.find(
          (item) => item.address.toLowerCase() === ticketAddress.toLowerCase()
        ) || null;

      const contract = getTicketEscrow(ticketAddress, signer);

      setTicketEscrow(contract);

      if (found) {
        setSelectedTicket(found);
      } else {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const fresh = await readTicket(ticketAddress, provider);
        setSelectedTicket(fresh);
      }
    } catch (e) {
      console.error("selectTicket failed:", e);
      setPageError(e?.reason || e?.message || "Failed to open ticket");
    }
  }

  const refreshSelectedTicket = useCallback(async () => {
    if (!window.ethereum) return;
    if (!selectedTicket) {
      await loadTickets();
      return;
    }

    try {
      setPageError(null);

      const provider = new ethers.BrowserProvider(window.ethereum);
      const fresh = await readTicket(selectedTicket.address, provider);

      setSelectedTicket(fresh);

      if (signer) {
        setTicketEscrow(getTicketEscrow(selectedTicket.address, signer));
      }

      await loadTickets();
    } catch (e) {
      console.error("refreshSelectedTicket failed:", e);
      setPageError(e?.reason || e?.message || "Failed to refresh ticket");
    }
  }, [loadTickets, readTicket, selectedTicket, signer]);

  useEffect(() => {
    if (!signer) return;
    loadTickets();
  }, [signer, loadTickets]);

  if (!signer) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center px-6">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md text-center space-y-4">
          <h1 className="text-2xl font-bold text-gray-800">
            TrustLance Ticket Platform
          </h1>

          <p className="text-sm text-gray-500">
            Connect your wallet to manage tickets on local chain {CHAIN_ID}.
          </p>

          <button
            onClick={connect}
            className="w-full px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800"
          >
            Connect Wallet
          </button>

          {connectError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
              {connectError}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <p className="text-xs text-gray-400">
          TicketBoard: {TICKET_BOARD_ADDRESS}
          <br />
          MultiSig: {MULTISIG_ADDRESS}
          <br />
          Chain ID: {CHAIN_ID}
        </p>

        <header className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800">
            TrustLance Ticket Platform
          </h1>

          <div className="text-sm text-gray-600 bg-white px-3 py-2 rounded-lg border">
            {short(address)}
          </div>
        </header>

        {pageError && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-4">
            {pageError}
          </div>
        )}

        <CreateTicket signer={signer} onCreated={loadTickets} />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">
                Ticket Board
              </h2>
              {loadingTickets && (
                <span className="text-sm text-gray-500">Loading...</span>
              )}
            </div>

            <TicketList tickets={tickets} onSelect={selectTicket} />
          </div>

          <div className="md:col-span-2">
            {selectedTicket ? (
              <TicketDetail
                escrow={ticketEscrow}
                multisig={multisig}
                arbiters={arbiters}
                ticket={selectedTicket}
                address={address}
                refresh={refreshSelectedTicket}
              />
            ) : (
              <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 text-gray-500">
                Select a ticket to view details.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;