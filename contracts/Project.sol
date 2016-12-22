pragma solidity ^0.4.6;

contract Project {

  struct Campaign {
    address owner;
    string description;
    uint goal;
    uint totalRaised;
    uint deadline;
    bool active;
    mapping (address => uint) contributions;
  }

  Campaign public campaign;
  event FundingSuccessful(uint timestamp);
  event FundingUnsuccessful(uint timestamp);
  event Contribute(uint timestamp, address contributor, uint amount);
  event Payout(uint timestamp, address beneficiary, uint amount);
  event Refund(uint timestamp, address contributor, uint amount);
  event Throw(uint index);

  function Project(string _description, uint _goalInFinney, uint _durationInMinutes) {
    campaign = Campaign(tx.origin, _description, _goalInFinney * 1000000000000000, 0, now + (_durationInMinutes * 1 minutes), true);
  }

  function fund() payable returns (bool status) {
        if (now>campaign.deadline) {
          // If the deadline has passed
          if (!tx.origin.send(msg.value)) {
            Throw(1);
            return false;
          }
          if (campaign.totalRaised<campaign.goal) {
            // If the deadline has passed without the funding goal being reached.
            FundingUnsuccessful(now);
            campaign.active=false;
            return refund(tx.origin);
          } else {
            campaign.active=false;// If the deadline has passed with the funding goal being reached.
            FundingSuccessful(now);

            return payout();
          }
        } else {
          // If the deadline has not passed
          if (campaign.totalRaised>=campaign.goal && campaign.active==true) {
            // If the deadline has not passed with the funding goal being reached.
            if (!tx.origin.send(msg.value)) {
                Throw(2);
                return false;
            }
            FundingSuccessful(now);
            campaign.active=false;
            return payout();
          } else {
            campaign.contributions[tx.origin] = msg.value;
            campaign.totalRaised += msg.value;
            Contribute(now, tx.origin, msg.value);
            return true;
          }
        }
  }

  function payout() internal returns (bool status) {
    uint amountRaised = campaign.totalRaised;
    campaign.totalRaised = 0;
    if (!campaign.owner.send(amountRaised)) {
      Throw(3);
      return false;
    } else {
      Payout(now, campaign.owner, amountRaised);
      return true;
    }
  }

  function refund(address contributor) internal returns (bool status) {
    uint contribution = campaign.contributions[contributor];
    if (contribution==0) throw;
    campaign.contributions[contributor] = 0;
    if (!contributor.send(contribution)) {
      Throw(4);
      return false;
    } else {
      Refund(now, contributor, contribution);
      return true;
    }
  }
}
