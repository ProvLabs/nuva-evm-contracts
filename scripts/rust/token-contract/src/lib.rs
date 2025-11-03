use alloy::sol;

sol!(
    #[sol(rpc)]
    #[derive(Debug)]
    TokenFactory,
    "../../../artifacts/contracts/TokenFactory.sol/TokenFactory.json"
);

sol!(
    #[sol(rpc)]
    #[derive(Debug)]
    CustomToken,
    "../../../artifacts/contracts/CustomToken.sol/CustomToken.json"
);
