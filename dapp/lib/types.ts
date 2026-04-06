/** Pool state persisted in deployed/pool.json or localStorage after UI init. */
export type PoolJson = {
  poolId: string;
  unsaltedPoolId?: string;
  token0: string;
  token1: string;
  curve: string[];
  kernel?: [string, string][];
  tickLower?: string;
  tickUpper?: string;
  qMin?: string;
  qMax?: string;
  tagShares?: string;
  sharesMinted?: string;
};

export type DeployedAddresses = {
  chainId?: string;
  nofeeswap: string;
  delegatee: string;
  operator: string;
  token0: string;
  token1: string;
  poolGrowthPortion: string;
};

export type LiquidityPosition = {
  poolId: string;
  qMin: string;
  qMax: string;
  tagShares: string;
  shares: string;
};
