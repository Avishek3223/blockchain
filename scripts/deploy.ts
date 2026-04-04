/**
 * Deploy NoFeeSwap core (via CREATE3) + operator + mock ERC20s. Writes `deployed/addresses.json`.
 *
 * Run: `npx hardhat node` in one terminal, then:
 *      `npx hardhat run scripts/deploy.ts --network localhost`
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContractFactory, toBeHex, zeroPadValue } from "ethers";
import { network } from "hardhat";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadArtifact(name: string): { abi: unknown[]; bytecode: string } {
  const p = join(root, "artifacts", name);
  const j = JSON.parse(readFileSync(p, "utf8")) as { abi: unknown[]; bytecode: string };
  return j;
}

async function main() {
  const { ethers } = await network.connect({
    network: "localhost",
    chainType: "l1",
  });

  const [deployerAdmin] = await ethers.getSigners();

  const DeployerHelper = loadArtifact(
    "nofeeswap-operator/contracts/helpers/Helpers.sol/DeployerHelper.json",
  );
  const NofeeswapDelegateeHelper = loadArtifact(
    "nofeeswap-operator/contracts/helpers/Helpers.sol/NofeeswapDelegateeHelper.json",
  );
  const NofeeswapHelper = loadArtifact(
    "nofeeswap-operator/contracts/helpers/Helpers.sol/NofeeswapHelper.json",
  );
  const MockHookHelper = loadArtifact(
    "nofeeswap-operator/contracts/helpers/Helpers.sol/MockHookHelper.json",
  );
  const ERC20FixedSupplyHelper = loadArtifact(
    "nofeeswap-operator/contracts/helpers/Helpers.sol/ERC20FixedSupplyHelper.json",
  );
  const OperatorArtifact = loadArtifact("nofeeswap-operator/contracts/Operator.sol/Operator.json");

  const deployerF = new ContractFactory(DeployerHelper.abi, DeployerHelper.bytecode, deployerAdmin);
  const deployerHelper = await deployerF.deploy(deployerAdmin.address);
  await deployerHelper.waitForDeployment();
  const deployerAddr = await deployerHelper.getAddress();

  const salt1 = zeroPadValue(toBeHex(1n), 32);
  const salt2 = zeroPadValue(toBeHex(2n), 32);

  const predNofeeswap: string = await deployerHelper.addressOf(salt2);

  const delFac = new ContractFactory(
    NofeeswapDelegateeHelper.abi,
    NofeeswapDelegateeHelper.bytecode,
    deployerAdmin,
  );
  const delTx = await delFac.getDeployTransaction(predNofeeswap);
  if (!delTx.data) throw new Error("no delegatee init data");
  await (await deployerHelper.create3(salt1, delTx.data)).wait();

  const predDelegatee: string = await deployerHelper.addressOf(salt1);

  const nfFac = new ContractFactory(NofeeswapHelper.abi, NofeeswapHelper.bytecode, deployerAdmin);
  const nfTx = await nfFac.getDeployTransaction(predDelegatee, deployerAdmin.address);
  if (!nfTx.data) throw new Error("no nofeeswap init data");
  await (await deployerHelper.create3(salt2, nfTx.data)).wait();

  const nofeeswap = await ethers.getContractAt(NofeeswapHelper.abi, predNofeeswap);
  const delegatee = await ethers.getContractAt(NofeeswapDelegateeHelper.abi, predDelegatee);

  const hookF = new ContractFactory(MockHookHelper.abi, MockHookHelper.bytecode, deployerAdmin);
  const hook = await hookF.deploy();
  await hook.waitForDeployment();
  const hookAddr = await hook.getAddress();

  const opF = new ContractFactory(OperatorArtifact.abi, OperatorArtifact.bytecode, deployerAdmin);
  const operator = await opF.deploy(predNofeeswap, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress);
  await operator.waitForDeployment();
  const operatorAddr = await operator.getAddress();

  const poolGrowthPortion = (1n << 47n) / 5n;
  const protocolGrowthPortion = 0n;
  const protocolWord =
    (poolGrowthPortion << 208n) + (protocolGrowthPortion << 160n) + BigInt(deployerAdmin.address);

  const modifyCalldata = delegatee.interface.encodeFunctionData("modifyProtocol", [protocolWord]);
  await (await nofeeswap.dispatch(modifyCalldata)).wait();
  await (await nofeeswap.setOperator(operatorAddr, true)).wait();

  const erc20F = new ContractFactory(ERC20FixedSupplyHelper.abi, ERC20FixedSupplyHelper.bytecode, deployerAdmin);
  const initialSupply = 2n ** 128n;
  const tokenA = await erc20F.deploy("Mock Token A", "MTA", initialSupply, deployerAdmin.address);
  const tokenB = await erc20F.deploy("Mock Token B", "MTB", initialSupply, deployerAdmin.address);
  await tokenA.waitForDeployment();
  await tokenB.waitForDeployment();
  const tokenAAddr = await tokenA.getAddress();
  const tokenBAddr = await tokenB.getAddress();

  let token0 = tokenAAddr;
  let token1 = tokenBAddr;
  if (BigInt(token0) > BigInt(token1)) {
    [token0, token1] = [token1, token0];
  }

  mkdirSync(join(root, "deployed"), { recursive: true });
  const out = {
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployerAddr,
    nofeeswap: predNofeeswap,
    delegatee: predDelegatee,
    operator: operatorAddr,
    hook: hookAddr,
    mockHook: hookAddr,
    token0,
    token1,
    rootSigner: deployerAdmin.address,
    poolGrowthPortion: poolGrowthPortion.toString(),
  };
  writeFileSync(join(root, "deployed", "addresses.json"), JSON.stringify(out, null, 2));
  console.log("Deployed:", out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
