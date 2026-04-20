import { ethers } from "ethers";

export async function connectWallet() {
  if (!window.ethereum) {
    alert("Please install MetaMask");
    return null;
  }

  try {
    const provider = new ethers.BrowserProvider(window.ethereum);

    // Request account access
    await provider.send("eth_requestAccounts", []);

    const signer = await provider.getSigner();
    const address = await signer.getAddress();

    return { provider, signer, address };
  } catch (err) {
    if (err.code === 4001) {
      // User rejected
      alert("❌ Wallet connection rejected");
    } else {
      console.error("connectWallet error:", err);
      alert("❌ Failed to connect wallet");
    }
    return null;
  }
}
