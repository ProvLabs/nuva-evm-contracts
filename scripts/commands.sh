npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
npx hardhat init
npm install @openzeppelin/contracts

npx hardhat clean
npx hardhat compile

npx hardhat node
npx hardhat run scripts/javascript/token-contract/deploy.js --network localhost

npx hardhat run scripts/javascript/token-contract/deploy.js --network sepolia

npx hardhat test
