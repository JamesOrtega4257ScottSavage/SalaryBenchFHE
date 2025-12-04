// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract SalaryBenchFHE is SepoliaConfig {
    struct SalaryData {
        euint32 encryptedSalary;
        euint32 encryptedJobCode;
        euint32 encryptedExperience;
        euint32 encryptedRegionCode;
        uint256 timestamp;
    }

    struct BenchmarkResult {
        euint32 encryptedPercentile;
        euint32 encryptedAvgSalary;
        euint32 encryptedMedian;
        bool isRevealed;
    }

    struct CategoryStats {
        euint32 encryptedTotalSalaries;
        euint32 encryptedSalarySum;
        uint256 dataCount;
    }

    uint256 public submissionCount;
    mapping(uint256 => SalaryData) public salarySubmissions;
    mapping(address => BenchmarkResult) public userResults;
    mapping(string => CategoryStats) public categoryStatistics;
    mapping(uint256 => uint256) private requestToSubmissionId;
    mapping(uint256 => address) private requestToUser;
    
    event SalarySubmitted(uint256 indexed submissionId);
    event BenchmarkRequested(address indexed user);
    event BenchmarkCalculated(address indexed user);
    event ResultRevealed(address indexed user);

    function submitSalaryData(
        euint32 salary,
        euint32 jobCode,
        euint32 experience,
        euint32 regionCode
    ) public {
        submissionCount++;
        salarySubmissions[submissionCount] = SalaryData({
            encryptedSalary: salary,
            encryptedJobCode: jobCode,
            encryptedExperience: experience,
            encryptedRegionCode: regionCode,
            timestamp: block.timestamp
        });

        string memory categoryKey = getCategoryKey(jobCode, regionCode);
        if (categoryStatistics[categoryKey].dataCount == 0) {
            categoryStatistics[categoryKey].encryptedTotalSalaries = FHE.asEuint32(0);
            categoryStatistics[categoryKey].encryptedSalarySum = FHE.asEuint32(0);
        }
        
        categoryStatistics[categoryKey].dataCount++;
        emit SalarySubmitted(submissionCount);
    }

    function requestBenchmark() public {
        bytes32[] memory ciphertexts = new bytes32[](4);
        ciphertexts[0] = FHE.toBytes32(salarySubmissions[submissionCount].encryptedSalary);
        ciphertexts[1] = FHE.toBytes32(salarySubmissions[submissionCount].encryptedJobCode);
        ciphertexts[2] = FHE.toBytes32(salarySubmissions[submissionCount].encryptedExperience);
        ciphertexts[3] = FHE.toBytes32(salarySubmissions[submissionCount].encryptedRegionCode);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.calculatePercentile.selector);
        requestToUser[reqId] = msg.sender;
        emit BenchmarkRequested(msg.sender);
    }

    function calculatePercentile(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        address user = requestToUser[requestId];
        require(user != address(0), "Invalid request");

        FHE.checkSignatures(requestId, cleartexts, proof);

        uint32[] memory salaryData = abi.decode(cleartexts, (uint32[]));
        uint32 salary = salaryData[0];
        uint32 jobCode = salaryData[1];
        uint32 regionCode = salaryData[3];

        string memory categoryKey = getCategoryKey(jobCode, regionCode);
        CategoryStats storage stats = categoryStatistics[categoryKey];

        // Calculate percentile (simplified example)
        euint32 percentile = FHE.div(
            FHE.mul(FHE.asEuint32(100), salary),
            stats.encryptedTotalSalaries
        );

        // Calculate average salary
        euint32 avgSalary = FHE.div(
            stats.encryptedSalarySum,
            FHE.asEuint32(stats.dataCount)
        );

        userResults[user] = BenchmarkResult({
            encryptedPercentile: percentile,
            encryptedAvgSalary: avgSalary,
            encryptedMedian: FHE.asEuint32(0), // Would calculate properly in production
            isRevealed: false
        });

        emit BenchmarkCalculated(user);
    }

    function requestResultDecryption() public {
        BenchmarkResult storage result = userResults[msg.sender];
        require(!result.isRevealed, "Already revealed");

        bytes32[] memory ciphertexts = new bytes32[](3);
        ciphertexts[0] = FHE.toBytes32(result.encryptedPercentile);
        ciphertexts[1] = FHE.toBytes32(result.encryptedAvgSalary);
        ciphertexts[2] = FHE.toBytes32(result.encryptedMedian);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptResults.selector);
        requestToUser[reqId] = msg.sender;
    }

    function decryptResults(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        address user = requestToUser[requestId];
        require(user != address(0), "Invalid request");

        FHE.checkSignatures(requestId, cleartexts, proof);

        uint32[] memory results = abi.decode(cleartexts, (uint32[]));
        userResults[user].isRevealed = true;

        emit ResultRevealed(user);
    }

    function updateCategoryStats(
        uint32 jobCode,
        uint32 regionCode,
        euint32 salary
    ) private {
        string memory categoryKey = getCategoryKey(jobCode, regionCode);
        categoryStatistics[categoryKey].encryptedTotalSalaries = FHE.add(
            categoryStatistics[categoryKey].encryptedTotalSalaries,
            FHE.asEuint32(1)
        );
        categoryStatistics[categoryKey].encryptedSalarySum = FHE.add(
            categoryStatistics[categoryKey].encryptedSalarySum,
            salary
        );
    }

    function getCategoryKey(uint32 jobCode, uint32 regionCode) private pure returns (string memory) {
        return string(abi.encodePacked(jobCode, "-", regionCode));
    }

    function getSubmissionCount() public view returns (uint256) {
        return submissionCount;
    }

    function getCategoryDataCount(string memory categoryKey) public view returns (uint256) {
        return categoryStatistics[categoryKey].dataCount;
    }

    function getResultStatus(address user) public view returns (bool) {
        return userResults[user].isRevealed;
    }
}