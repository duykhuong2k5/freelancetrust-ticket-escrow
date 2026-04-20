export default function DisputePanel({ multisig }) {
  async function vote(payFreelancer) {
    await (await multisig.vote(payFreelancer)).wait();
    alert("Vote submitted");
  }

  return (
    <div className="border p-4 rounded mt-4">
      <h3 className="font-bold">⚖️ Arbitration</h3>

      <button
        className="btn-success mt-2"
        onClick={() => vote(true)}
      >
        Pay Freelancer
      </button>

      <button
        className="btn-danger mt-2"
        onClick={() => vote(false)}
      >
        Refund Client
      </button>
    </div>
  );
}
