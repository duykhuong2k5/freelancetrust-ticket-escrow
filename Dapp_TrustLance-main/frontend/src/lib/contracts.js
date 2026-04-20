import { ethers } from "ethers";
import TicketBoardABI from "../abi/TicketBoard.json";
import TicketEscrowABI from "../abi/TicketEscrow.json";
import DisputeMultiSigABI from "../abi/DisputeMultiSig.json";
import { TICKET_BOARD_ADDRESS, MULTISIG_ADDRESS } from "../config";

/**
 * TicketBoard - read or write
 */
export function getTicketBoard(runner) {
  return new ethers.Contract(
    TICKET_BOARD_ADDRESS,
    TicketBoardABI.abi,
    runner
  );
}

/**
 * TicketEscrow - read or write
 */
export function getTicketEscrow(address, runner) {
  return new ethers.Contract(
    address,
    TicketEscrowABI.abi,
    runner
  );
}

/**
 * DisputeMultiSig - read or write
 */
export function getMultiSig(runner) {
  return new ethers.Contract(
    MULTISIG_ADDRESS,
    DisputeMultiSigABI.abi,
    runner
  );
}
/**
 * Claim ticket (worker)
 */
export async function claimTicket(escrowAddress, signer) {
  const escrow = getTicketEscrow(escrowAddress, signer);
  const tx = await escrow.claimTicket();
  await tx.wait();
  return tx;
}

/**
 * Submit proof (worker)
 */
export async function submitProof(
  escrowAddress,
  signer,
  proofCID,
  proofNote
) {
  const escrow = getTicketEscrow(escrowAddress, signer);
  const tx = await escrow.submitProof(proofCID, proofNote);
  await tx.wait();
  return tx;
}

/**
 * 🔥 APPROVE → TRẢ ETH
 */
export async function approveSubmission(escrowAddress, signer) {
  const escrow = getTicketEscrow(escrowAddress, signer);
  const tx = await escrow.approveSubmission();
  await tx.wait();
  return tx;
}