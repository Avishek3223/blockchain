import hre from "hardhat";

async function main() {
  const connection = await hre.network.connect();

  const Counter = await connection.ethers.getContractFactory("Counter");
  const counter = await Counter.deploy();
  await counter.waitForDeployment();

  console.log("Counter deployed to:", await counter.getAddress());

  let x = await counter.x();
  console.log("Initial x:", x.toString());

  const tx = await counter.inc();
  await tx.wait();

  x = await counter.x();
  console.log("Updated x:", x.toString());
}

main();