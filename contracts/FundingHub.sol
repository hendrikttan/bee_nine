import "./Project.sol";

pragma solidity ^0.4.6;

contract FundingHub {

  uint public totalProjects = 0;
  mapping(address => uint) public mapAddressToIndex;
  mapping(uint => address) public mapIndexToAddress;

  event ProjectCreated(uint timestamp, address projectAddress);

  function createProject(string _description, uint _goalInFinney, uint _durationInMinutes) returns (address) {
    totalProjects++;
    Project project = new Project (_description, _goalInFinney, _durationInMinutes);
    address projectAddress = address(project);
    mapIndexToAddress[totalProjects] = projectAddress;
    mapAddressToIndex[projectAddress] = totalProjects;
    ProjectCreated(now, projectAddress);
    return projectAddress;
  }

  function contribute(address _projectAddress) payable returns (bool status) {
    Project project = Project(_projectAddress);
    return project.fund.value(msg.value)();
  }
}
