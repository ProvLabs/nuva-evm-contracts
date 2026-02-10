npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
npx hardhat init
npm install @openzeppelin/contracts

npx hardhat clean
npx hardhat compile

npx hardhat node
npx hardhat run scripts/javascript/token-contract/deploy.js --network localhost

npx hardhat run scripts/javascript/token-contract/deploy.js --network sepolia

npx hardhat test

npx hardhat verify --network base --constructor-args scripts/javascript/cross-chain-contract/arguements.js 0x8d5752fD983731DB0329Ac818AE0676BaA7339cC
npx hardhat verify --network eth --constructor-args scripts/javascript/cross-chain-contract/arguementsEth.js 0xe49425ed1B967618DDf9Cbc936ceb8868dbc97B3
