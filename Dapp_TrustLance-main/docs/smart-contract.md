## 1. Xây dựng Smart Contract

### 1.1. Cấu trúc và các thành phần chính của Smart Contract

Hệ thống TrustLance được xây dựng dựa trên kiến trúc ba smart contract hoạt động phối hợp với nhau, được phát triển bằng ngôn ngữ Solidity phiên bản 0.8.20 trên nền tảng Ethereum.

#### 1.1.1. FreelanceEscrow Contract

Contract `FreelanceEscrow` là thành phần cốt lõi của hệ thống, đảm nhiệm vai trò quản lý từng hợp đồng công việc giữa người thuê (Client) và người làm việc (Freelancer).

**Các biến trạng thái (State Variables):**

| Biến | Kiểu dữ liệu | Mô tả |
|------|--------------|-------|
| `factory` | `address` | Địa chỉ của contract Factory đã tạo escrow này |
| `client` | `address payable` | Địa chỉ ví của người thuê |
| `freelancer` | `address payable` | Địa chỉ ví của người làm việc |
| `amount` | `uint256` | Số tiền ETH được khóa trong hợp đồng |
| `deadline` | `uint256` | Thời hạn hoàn thành công việc (Unix timestamp) |
| `arbiter` | `address` | Địa chỉ contract DisputeMultiSig |
| `status` | `Status` | Trạng thái hiện tại của hợp đồng |

**Enum Status - Các trạng thái của hợp đồng:**

```solidity
enum Status {
    Created,    // 0 - Vừa tạo, chờ freelancer nhận việc
    Accepted,   // 1 - Freelancer đã nhận việc
    Submitted,  // 2 - Freelancer đã nộp kết quả
    Disputed,   // 3 - Đang trong tranh chấp
    Released,   // 4 - Đã thanh toán cho freelancer
    Refunded    // 5 - Đã hoàn tiền cho client
}
```

**Các Events được định nghĩa:**

```solidity
event JobAccepted(address indexed freelancer);  // Phát ra khi freelancer nhận việc
event WorkSubmitted();                          // Phát ra khi freelancer nộp kết quả
event DisputeOpened();                          // Phát ra khi client mở tranh chấp
event Released(address indexed freelancer, uint256 amount);  // Phát ra khi thanh toán
event Refunded(address indexed client, uint256 amount);      // Phát ra khi hoàn tiền
```

**Các Modifiers kiểm soát quyền truy cập:**

```solidity
modifier onlyFactory()     // Chỉ Factory contract có thể gọi
modifier onlyClient()      // Chỉ người thuê có thể gọi
modifier onlyFreelancer()  // Chỉ người làm việc có thể gọi
modifier onlyArbiter()     // Chỉ contract trọng tài có thể gọi
```

#### 1.1.2. EscrowFactory Contract

Contract `EscrowFactory` đóng vai trò là nhà máy sản xuất các hợp đồng Escrow, áp dụng **Factory Pattern** trong thiết kế phần mềm.

**Các biến trạng thái:**

| Biến | Kiểu dữ liệu | Mô tả |
|------|--------------|-------|
| `arbiter` | `address` | Địa chỉ contract DisputeMultiSig |
| `jobs` | `address[]` | Mảng lưu trữ tất cả địa chỉ Escrow đã tạo |
| `jobsByClient` | `mapping(address => address[])` | Ánh xạ từ địa chỉ client đến danh sách jobs |

**Event JobCreated:**

```solidity
event JobCreated(
    address indexed escrow,   // Địa chỉ escrow vừa tạo
    address indexed client,   // Địa chỉ người thuê
    uint256 amount,           // Số tiền khóa
    uint256 deadline,         // Thời hạn
    uint256 timestamp         // Thời điểm tạo
);
```

#### 1.1.3. DisputeMultiSig Contract

Contract `DisputeMultiSig` triển khai cơ chế **Multi-Signature Voting** để giải quyết tranh chấp một cách công bằng và phi tập trung.

**Các biến trạng thái:**

| Biến | Kiểu dữ liệu | Mô tả |
|------|--------------|-------|
| `arbiters` | `address[]` | Danh sách địa chỉ các trọng tài |
| `isArbiter` | `mapping(address => bool)` | Kiểm tra một địa chỉ có phải trọng tài không |
| `required` | `uint256` | Số phiếu bầu tối thiểu để đưa ra quyết định |
| `disputes` | `mapping(address => VoteState)` | Trạng thái bỏ phiếu cho từng escrow |

**Struct VoteState:**

```solidity
struct VoteState {
    uint256 votesForFreelancer;           // Số phiếu ủng hộ freelancer
    uint256 votesForClient;               // Số phiếu ủng hộ client
    bool resolved;                        // Tranh chấp đã được giải quyết chưa
    mapping(address => bool) hasVoted;    // Trọng tài đã bỏ phiếu chưa
}
```

### 1.2. Các hàm chức năng chính của Smart Contract

#### 1.2.1. Hàm khởi tạo và cấu hình

**Hàm `init()` - Khởi tạo Escrow:**

```solidity
function init(
    address _client,
    uint256 _deadline
) external payable onlyFactory {
    require(client == address(0), "Already initialized");
    require(_deadline > block.timestamp, "Invalid deadline");
    require(msg.value > 0, "Amount must be > 0");

    client = payable(_client);
    amount = msg.value;
    deadline = _deadline;
    status = Status.Created;
}
```

Hàm này được gọi bởi Factory ngay sau khi tạo contract mới, thiết lập các thông số ban đầu và nhận ETH từ client.

**Hàm `createJob()` - Tạo công việc mới:**

```solidity
function createJob(uint256 deadline)
    external
    payable
    returns (address)
{
    require(msg.value > 0, "Amount must be > 0");
    require(deadline > block.timestamp, "Invalid deadline");

    FreelanceEscrow escrow = new FreelanceEscrow();
    escrow.init{value: msg.value}(msg.sender, deadline);
    escrow.setArbiter(arbiter);

    jobs.push(address(escrow));
    jobsByClient[msg.sender].push(address(escrow));

    emit JobCreated(address(escrow), msg.sender, msg.value, deadline, block.timestamp);
    return address(escrow);
}
```

#### 1.2.2. Hàm luồng làm việc Freelancer

**Hàm `acceptJob()` - Nhận công việc:**

```solidity
function acceptJob() external {
    require(status == Status.Created, "Not open");
    require(freelancer == address(0), "Already accepted");

    freelancer = payable(msg.sender);
    status = Status.Accepted;

    emit JobAccepted(msg.sender);
}
```

Bất kỳ ai cũng có thể nhận việc theo cơ chế "first-come, first-served".

**Hàm `submitWork()` - Nộp kết quả:**

```solidity
function submitWork() external onlyFreelancer {
    require(status == Status.Accepted, "Invalid state");

    status = Status.Submitted;
    emit WorkSubmitted();
}
```

#### 1.2.3. Hàm luồng làm việc Client

**Hàm `approveWork()` - Chấp nhận và thanh toán:**

```solidity
function approveWork() external onlyClient {
    require(status == Status.Submitted, "Not submitted");

    status = Status.Released;
    _payFreelancer();
    emit Released(freelancer, amount);
}
```

Client có thể chấp nhận kết quả bất kỳ lúc nào sau khi freelancer nộp, kể cả khi đã quá deadline.

**Hàm `dispute()` - Mở tranh chấp:**

```solidity
function dispute() external onlyClient {
    require(status == Status.Submitted, "Not submitted");

    status = Status.Disputed;
    emit DisputeOpened();
}
```

Client có thể mở tranh chấp ngay sau khi freelancer nộp kết quả nếu công việc không đạt yêu cầu.

#### 1.2.4. Hàm giải quyết tranh chấp

**Hàm `vote()` - Trọng tài bỏ phiếu:**

```solidity
function vote(address escrow, bool payFreelancer) external {
    require(isArbiter[msg.sender], "Not an arbiter");

    VoteState storage v = disputes[escrow];
    require(!v.resolved, "Dispute already resolved");
    require(!v.hasVoted[msg.sender], "Already voted");

    v.hasVoted[msg.sender] = true;

    if (payFreelancer) {
        v.votesForFreelancer++;
    } else {
        v.votesForClient++;
    }

    emit Voted(escrow, msg.sender, payFreelancer);

    // Tự động giải quyết khi đủ phiếu
    if (v.votesForFreelancer >= required) {
        v.resolved = true;
        IFreelanceEscrow(escrow).resolveDispute(true);
        emit Resolved(escrow, true);
    } 
    else if (v.votesForClient >= required) {
        v.resolved = true;
        IFreelanceEscrow(escrow).resolveDispute(false);
        emit Resolved(escrow, false);
    }
}
```

**Hàm `resolveDispute()` - Thực thi quyết định:**

```solidity
function resolveDispute(bool payFreelancer) external onlyArbiter {
    require(status == Status.Disputed, "No dispute");

    if (payFreelancer) {
        status = Status.Released;
        _payFreelancer();
        emit Released(freelancer, amount);
    } else {
        status = Status.Refunded;
        _refundClient();
        emit Refunded(client, amount);
    }
}
```

#### 1.2.5. Hàm thanh toán nội bộ

```solidity
function _payFreelancer() internal {
    (bool ok,) = freelancer.call{value: amount}("");
    require(ok, "Transfer failed");
}

function _refundClient() internal {
    (bool ok,) = client.call{value: amount}("");
    require(ok, "Transfer failed");
}
```

Sử dụng low-level `call` thay vì `transfer` để tương thích với các contract có logic phức tạp trong fallback function.

---

## 2. Phát triển giao diện người dùng

### 2.1. Tích hợp thư viện Ethers.js

Ethers.js phiên bản 6 được sử dụng để tương tác với blockchain Ethereum từ phía frontend.

#### 2.1.1. Cấu hình Contract Instances

File `src/lib/contracts.js` định nghĩa các hàm tạo contract instances:

```javascript
import { ethers } from "ethers";
import FactoryABI from "../abi/EscrowFactory.json";
import EscrowABI from "../abi/FreelanceEscrow.json";
import DisputeMultiSigABI from "../abi/DisputeMultiSig.json";
import { FACTORY_ADDRESS, MULTISIG_ADDRESS } from "../config";

// Tạo instance Factory contract
export function getFactory(signer) {
  return new ethers.Contract(
    FACTORY_ADDRESS,
    FactoryABI.abi,
    signer
  );
}

// Tạo instance Escrow contract
export function getEscrow(address, runner) {
  return new ethers.Contract(
    address,
    EscrowABI.abi,
    runner
  );
}

// Tạo instance MultiSig contract
export function getMultiSig(runner) {
  return new ethers.Contract(
    MULTISIG_ADDRESS,
    DisputeMultiSigABI.abi,
    runner
  );
}
```

#### 2.1.2. Đọc dữ liệu từ Blockchain

```javascript
async function loadJobs() {
  const provider = new ethers.BrowserProvider(window.ethereum);
  const jobAddresses = await factory.getAllJobs();

  for (const addr of jobAddresses) {
    const escrow = getEscrow(addr, provider);

    const [client, freelancer, amount, deadline, status] = 
      await Promise.all([
        escrow.client(),
        escrow.freelancer(),
        escrow.amount(),
        escrow.deadline(),
        escrow.status(),
      ]);

    // Xử lý dữ liệu...
  }
}
```

#### 2.1.3. Gửi giao dịch lên Blockchain

```javascript
async function createJob() {
  const factory = getFactory(signer);
  const value = ethers.parseEther(amount);  // Chuyển đổi ETH sang Wei
  
  const tx = await factory.createJob(deadline, { value });
  await tx.wait();  // Đợi transaction được confirm
}
```

### 2.2. Xử lý kết nối ví MetaMask

#### 2.2.1. Module kết nối ví

File `src/lib/ethereum.js` xử lý việc kết nối với MetaMask:

```javascript
import { ethers } from "ethers";

export async function connectWallet() {
  // Kiểm tra MetaMask đã cài đặt chưa
  if (!window.ethereum) {
    alert("Please install MetaMask");
    return null;
  }

  try {
    // Tạo provider từ MetaMask
    const provider = new ethers.BrowserProvider(window.ethereum);

    // Yêu cầu quyền truy cập tài khoản
    await provider.send("eth_requestAccounts", []);

    // Lấy signer để ký giao dịch
    const signer = await provider.getSigner();
    const address = await signer.getAddress();

    return { provider, signer, address };
  } catch (err) {
    if (err.code === 4001) {
      alert("❌ Wallet connection rejected");
    } else {
      alert("❌ Failed to connect wallet");
    }
    return null;
  }
}
```

#### 2.2.2. Quản lý state kết nối

```javascript
function App() {
  const [signer, setSigner] = useState(null);
  const [address, setAddress] = useState(null);

  async function connect() {
    const res = await connectWallet();
    if (!res) return;

    setSigner(res.signer);
    setAddress(res.address);
  }

  // Hiển thị nút Connect nếu chưa kết nối
  if (!signer) {
    return (
      <button onClick={connect}>
        Connect Wallet
      </button>
    );
  }

  // Hiển thị ứng dụng nếu đã kết nối
  return <MainApp />;
}
```

### 2.3. Thiết kế giao diện và tương tác người dùng

#### 2.3.1. Kiến trúc Component

Ứng dụng được chia thành các React components với cấu trúc phân cấp rõ ràng:

```
App.jsx
├── CreateJob.jsx       # Form tạo công việc mới
├── JobList.jsx         # Danh sách các công việc
│   └── JobCard.jsx     # Card hiển thị thông tin job
├── JobDetail.jsx       # Chi tiết công việc được chọn
│   └── ArbiterPanel.jsx # Panel bỏ phiếu cho trọng tài
```

#### 2.3.2. Component CreateJob

Form tạo công việc mới với các trường:
- **Amount**: Số tiền ETH cần khóa
- **Deadline**: Thời hạn hoàn thành (UTC)

```jsx
export default function CreateJob({ signer, onCreated }) {
  const [amount, setAmount] = useState("0.1");
  const [year, setYear] = useState(now.getUTCFullYear());
  // ... các state khác

  async function create() {
    const factory = getFactory(signer);
    const value = ethers.parseEther(amount);
    const tx = await factory.createJob(deadline, { value });
    await tx.wait();
    onCreated?.();  // Callback để refresh danh sách
  }

  return (
    <form>
      <input value={amount} onChange={e => setAmount(e.target.value)} />
      {/* Các input khác */}
      <button onClick={create}>Create Job</button>
    </form>
  );
}
```

#### 2.3.3. Component JobDetail

Hiển thị chi tiết và các hành động có thể thực hiện dựa trên vai trò người dùng:

| Vai trò | Trạng thái | Hành động có thể thực hiện |
|---------|------------|---------------------------|
| Bất kỳ ai | Created | Accept Job |
| Freelancer | Accepted | Submit Work |
| Client | Submitted | Approve & Release, Open Dispute |
| Arbiter | Disputed | Vote (Pay Freelancer / Refund Client) |

#### 2.3.4. Component ArbiterPanel

Giao diện bỏ phiếu dành cho trọng tài với các tính năng:
- Hiển thị số phiếu hiện tại cho mỗi bên
- Progress bar trực quan
- Vô hiệu hóa nút sau khi đã bỏ phiếu
- Thông báo khi tranh chấp được giải quyết

```jsx
export default function ArbiterPanel({ multisig, escrowAddr, address }) {
  const {
    vote,
    votesForFreelancer,
    votesForClient,
    required,
    hasVoted,
    resolved,
  } = useArbitration(multisig, escrowAddr, address);

  return (
    <div>
      <div>Pay Freelancer: {votesForFreelancer}/{required}</div>
      <div>Refund Client: {votesForClient}/{required}</div>
      
      {!resolved && !hasVoted && (
        <>
          <button onClick={() => vote(true)}>Pay Freelancer</button>
          <button onClick={() => vote(false)}>Refund Client</button>
        </>
      )}
    </div>
  );
}
```

#### 2.3.5. Styling với TailwindCSS

Ứng dụng sử dụng TailwindCSS với các custom component classes:

```css
@layer components {
  .btn {
    @apply px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 
           disabled:opacity-50 disabled:cursor-not-allowed;
  }

  .btn-primary {
    @apply btn bg-gray-900 text-white hover:bg-gray-800;
  }

  .btn-success {
    @apply btn bg-emerald-600 text-white hover:bg-emerald-700;
  }

  .btn-danger {
    @apply btn bg-red-600 text-white hover:bg-red-700;
  }
}
```

---

## 3. Quy trình triển khai hệ thống

### 3.1. Triển khai Smart Contract lên mạng local

#### 3.1.1. Cấu hình Hardhat

File `hardhat.config.js`:

```javascript
require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: "0.8.24",
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545/",
      chainId: 31337,
    },
  },
};
```

#### 3.1.2. Script triển khai

File `scripts/deploy.js` thực hiện các bước:

**Bước 1: Triển khai DisputeMultiSig**

```javascript
const arbiters = [arbiter1.address, arbiter2.address, arbiter3.address];
const required = 2;  // Cần 2/3 phiếu

const DisputeMultiSig = await ethers.getContractFactory("DisputeMultiSig");
const multisig = await DisputeMultiSig.deploy(arbiters, required);
await multisig.waitForDeployment();
```

**Bước 2: Triển khai EscrowFactory**

```javascript
const EscrowFactory = await ethers.getContractFactory("EscrowFactory");
const factory = await EscrowFactory.deploy(multisigAddress);
await factory.waitForDeployment();
```

**Bước 3: Tạo Job demo (tùy chọn)**

```javascript
const deadline = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
const amount = ethers.parseEther("1");

const tx = await factory.createJob(deadline, { value: amount });
await tx.wait();
```

**Bước 4: Lưu thông tin triển khai**

```javascript
const deployment = {
  factory: factoryAddress,
  multisig: multisigAddress,
  demoEscrow: escrowAddress,
  arbiters,
  required,
};

fs.writeFileSync(
  path.join(outDir, "localhost.json"),
  JSON.stringify(deployment, null, 2)
);
```

#### 3.1.3. Quy trình triển khai

```bash
# Terminal 1: Khởi động Hardhat node
npx hardhat node

# Terminal 2: Triển khai contracts
npx hardhat run scripts/deploy.js --network localhost
```

Kết quả triển khai:

```
🚀 Deploying with: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
✅ DisputeMultiSig deployed: 0x5FbDB2315678afecb367f032d93F642f64180aa3
✅ EscrowFactory deployed: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
📄 Demo Job created: 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0

🎉 DEPLOY COMPLETED
```

### 3.2. Triển khai ứng dụng Web Frontend

#### 3.2.1. Cấu hình địa chỉ Contract

File `src/config.js`:

```javascript
export const FACTORY_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
export const MULTISIG_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
export const CHAIN_ID = 31337;
```

#### 3.2.2. Build và chạy ứng dụng

```bash
# Cài đặt dependencies
cd frontend
npm install

# Build TailwindCSS
npx tailwindcss -i ./src/input.css -o ./src/output.css

# Chạy development server
npm run dev
```

#### 3.2.3. Cấu hình MetaMask

1. **Thêm mạng local:**
   - Network Name: Hardhat Local
   - RPC URL: http://127.0.0.1:8545
   - Chain ID: 31337
   - Currency Symbol: ETH

2. **Import tài khoản test:**
   - Sử dụng private key từ Hardhat node
   - Mỗi tài khoản test có 10,000 ETH

#### 3.2.4. Kiểm thử hệ thống

**Test cases đã thực hiện:**

| STT | Test Case | Kết quả |
|-----|-----------|---------|
| 1 | Kết nối ví MetaMask | ✅ Pass |
| 2 | Tạo công việc mới với ETH | ✅ Pass |
| 3 | Freelancer nhận việc | ✅ Pass |
| 4 | Freelancer nộp kết quả | ✅ Pass |
| 5 | Client chấp nhận và thanh toán | ✅ Pass |
| 6 | Client mở tranh chấp | ✅ Pass |
| 7 | Trọng tài bỏ phiếu | ✅ Pass |
| 8 | Giải quyết tranh chấp (Freelancer thắng) | ✅ Pass |
| 9 | Giải quyết tranh chấp (Client thắng) | ✅ Pass |

**Kết quả chạy test tự động:**

```
107 passing (6s)

Contracts deployed:
- DisputeMultiSig: 997,041 gas
- EscrowFactory: 2,318,255 gas
- FreelanceEscrow: 1,564,078 gas
```

---
