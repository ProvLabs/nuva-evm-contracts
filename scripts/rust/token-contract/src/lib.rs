use alloy::sol;

sol!(
    #[sol(rpc)]
    #[derive(Debug)]
    TokenFactory,
    "../../../artifacts/contracts/Factory.sol/TokenFactory.json"
);

sol!(
    #[sol(rpc)]
    #[derive(Debug)]
    CustomToken,
    "../../../artifacts/contracts/Factory.sol/CustomToken.json"
);
