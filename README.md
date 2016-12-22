# bee_nine

#repository https://github.com/hendrikttan/bee_nine/


To run test, compile, and migrate first.
`truffle compile --compile--all`
`truffle migrate --reset`
`truffle test`

To run the app, execute the following and open http://localhost:8080
`truffle build && truffle serve`

For simplicity-purpose, assuming using testrpc, or real geth with rpc enabled, and with at least 2 accounts, whereas the 1st account (index 0) is always the creator of projects, and 2nd account (index 1) is always the contributor of projects.
