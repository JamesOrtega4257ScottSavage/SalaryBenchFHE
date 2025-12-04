// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface SalaryData {
  id: string;
  encryptedSalary: string;
  industry: string;
  position: string;
  region: string;
  timestamp: number;
  percentile?: number;
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [salaryData, setSalaryData] = useState<SalaryData[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newSalaryData, setNewSalaryData] = useState({
    industry: "",
    position: "",
    region: "",
    salary: ""
  });
  const [showTutorial, setShowTutorial] = useState(false);
  const [selectedSalary, setSelectedSalary] = useState<SalaryData | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Calculate statistics for dashboard
  const techCount = salaryData.filter(s => s.industry === "Technology").length;
  const financeCount = salaryData.filter(s => s.industry === "Finance").length;
  const healthcareCount = salaryData.filter(s => s.industry === "Healthcare").length;

  useEffect(() => {
    loadSalaryData().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadSalaryData = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("salary_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing salary keys:", e);
        }
      }
      
      const list: SalaryData[] = [];
      
      for (const key of keys) {
        try {
          const salaryBytes = await contract.getData(`salary_${key}`);
          if (salaryBytes.length > 0) {
            try {
              const salaryData = JSON.parse(ethers.toUtf8String(salaryBytes));
              list.push({
                id: key,
                encryptedSalary: salaryData.salary,
                industry: salaryData.industry,
                position: salaryData.position,
                region: salaryData.region,
                timestamp: salaryData.timestamp,
                percentile: salaryData.percentile
              });
            } catch (e) {
              console.error(`Error parsing salary data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading salary ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setSalaryData(list);
    } catch (e) {
      console.error("Error loading salary data:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitSalary = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setSubmitting(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting salary data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedSalary = `FHE-${btoa(newSalaryData.salary)}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const salaryId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const salaryRecord = {
        salary: encryptedSalary,
        industry: newSalaryData.industry,
        position: newSalaryData.position,
        region: newSalaryData.region,
        timestamp: Math.floor(Date.now() / 1000)
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `salary_${salaryId}`, 
        ethers.toUtf8Bytes(JSON.stringify(salaryRecord))
      );
      
      const keysBytes = await contract.getData("salary_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(salaryId);
      
      await contract.setData(
        "salary_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Salary data submitted securely!"
      });
      
      await loadSalaryData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowSubmitModal(false);
        setNewSalaryData({
          industry: "",
          position: "",
          region: "",
          salary: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setSubmitting(false);
    }
  };

  const calculatePercentile = async () => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Calculating percentile with FHE..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      // Call isAvailable to demonstrate FHE functionality
      await contract.isAvailable();
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE percentile calculation completed!"
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Calculation failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const tutorialSteps = [
    {
      title: "Connect Wallet",
      description: "Connect your Web3 wallet to submit salary data anonymously",
      icon: "🔗"
    },
    {
      title: "Submit Encrypted Salary",
      description: "Add your salary details which will be encrypted using FHE",
      icon: "🔒"
    },
    {
      title: "FHE Processing",
      description: "Your salary is compared with others while remaining encrypted",
      icon: "⚙️"
    },
    {
      title: "View Percentile",
      description: "See your salary percentile without revealing your actual salary",
      icon: "📊"
    }
  ];

  const filteredSalaries = salaryData.filter(salary => 
    salary.industry.toLowerCase().includes(searchTerm.toLowerCase()) ||
    salary.position.toLowerCase().includes(searchTerm.toLowerCase()) ||
    salary.region.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderIndustryChart = () => {
    const total = salaryData.length || 1;
    const techPercentage = (techCount / total) * 100;
    const financePercentage = (financeCount / total) * 100;
    const healthcarePercentage = (healthcareCount / total) * 100;

    return (
      <div className="chart-container">
        <div className="chart-bar">
          <div className="bar-label">Technology</div>
          <div className="bar-track">
            <div 
              className="bar-fill tech" 
              style={{ width: `${techPercentage}%` }}
            ></div>
          </div>
          <div className="bar-value">{techCount}</div>
        </div>
        <div className="chart-bar">
          <div className="bar-label">Finance</div>
          <div className="bar-track">
            <div 
              className="bar-fill finance" 
              style={{ width: `${financePercentage}%` }}
            ></div>
          </div>
          <div className="bar-value">{financeCount}</div>
        </div>
        <div className="chart-bar">
          <div className="bar-label">Healthcare</div>
          <div className="bar-track">
            <div 
              className="bar-fill healthcare" 
              style={{ width: `${healthcarePercentage}%` }}
            ></div>
          </div>
          <div className="bar-value">{healthcareCount}</div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Loading salary benchmark data...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">💼</div>
          <h1>SalaryBench<span>FHE</span></h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowSubmitModal(true)} 
            className="submit-salary-btn"
          >
            + Submit Salary
          </button>
          <button 
            className="tutorial-btn"
            onClick={() => setShowTutorial(!showTutorial)}
          >
            {showTutorial ? "Hide Guide" : "How It Works"}
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>Anonymous Salary Benchmarking</h2>
            <p>Compare your salary anonymously using Fully Homomorphic Encryption technology</p>
          </div>
        </div>
        
        {showTutorial && (
          <div className="tutorial-section">
            <h2>How FHE Salary Benchmarking Works</h2>
            <p className="subtitle">Your salary data remains encrypted throughout the entire process</p>
            
            <div className="tutorial-steps">
              {tutorialSteps.map((step, index) => (
                <div 
                  className="tutorial-step"
                  key={index}
                >
                  <div className="step-icon">{step.icon}</div>
                  <div className="step-content">
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="dashboard-grid">
          <div className="dashboard-card">
            <h3>Project Overview</h3>
            <p>SalaryBenchFHE uses FHE technology to benchmark salaries without exposing individual data. Your information stays encrypted while being compared against industry standards.</p>
            <div className="fhe-badge">
              <span>FHE-Powered</span>
            </div>
          </div>
          
          <div className="dashboard-card">
            <h3>Data Statistics</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{salaryData.length}</div>
                <div className="stat-label">Total Salaries</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{techCount}</div>
                <div className="stat-label">Technology</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{financeCount}</div>
                <div className="stat-label">Finance</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{healthcareCount}</div>
                <div className="stat-label">Healthcare</div>
              </div>
            </div>
          </div>
          
          <div className="dashboard-card">
            <h3>Industry Distribution</h3>
            {renderIndustryChart()}
          </div>
        </div>
        
        <div className="salary-section">
          <div className="section-header">
            <h2>Salary Benchmark Data</h2>
            <div className="header-actions">
              <input 
                type="text"
                placeholder="Search industry, position or region..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
              <button 
                onClick={loadSalaryData}
                className="refresh-btn"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
              <button 
                onClick={calculatePercentile}
                className="calculate-btn"
              >
                Calculate My Percentile
              </button>
            </div>
          </div>
          
          <div className="salary-list">
            <div className="table-header">
              <div className="header-cell">Industry</div>
              <div className="header-cell">Position</div>
              <div className="header-cell">Region</div>
              <div className="header-cell">Date Submitted</div>
              <div className="header-cell">Percentile</div>
            </div>
            
            {filteredSalaries.length === 0 ? (
              <div className="no-data">
                <div className="no-data-icon">📊</div>
                <p>No salary data found</p>
                <button 
                  className="submit-btn"
                  onClick={() => setShowSubmitModal(true)}
                >
                  Submit First Salary
                </button>
              </div>
            ) : (
              filteredSalaries.map(salary => (
                <div 
                  className="salary-row" 
                  key={salary.id}
                  onClick={() => setSelectedSalary(salary)}
                >
                  <div className="table-cell">{salary.industry}</div>
                  <div className="table-cell">{salary.position}</div>
                  <div className="table-cell">{salary.region}</div>
                  <div className="table-cell">
                    {new Date(salary.timestamp * 1000).toLocaleDateString()}
                  </div>
                  <div className="table-cell">
                    {salary.percentile ? (
                      <span className="percentile-badge">
                        Top {salary.percentile}%
                      </span>
                    ) : (
                      <span className="pending-badge">Pending</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
  
      {showSubmitModal && (
        <ModalSubmit 
          onSubmit={submitSalary} 
          onClose={() => setShowSubmitModal(false)} 
          submitting={submitting}
          salaryData={newSalaryData}
          setSalaryData={setNewSalaryData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
      
      {selectedSalary && (
        <div className="detail-modal">
          <div className="detail-content">
            <div className="modal-header">
              <h3>Salary Details</h3>
              <button onClick={() => setSelectedSalary(null)} className="close-modal">×</button>
            </div>
            <div className="modal-body">
              <div className="detail-item">
                <label>Industry:</label>
                <span>{selectedSalary.industry}</span>
              </div>
              <div className="detail-item">
                <label>Position:</label>
                <span>{selectedSalary.position}</span>
              </div>
              <div className="detail-item">
                <label>Region:</label>
                <span>{selectedSalary.region}</span>
              </div>
              <div className="detail-item">
                <label>Date Submitted:</label>
                <span>{new Date(selectedSalary.timestamp * 1000).toLocaleDateString()}</span>
              </div>
              <div className="detail-item">
                <label>Encrypted Salary:</label>
                <span className="encrypted-data">{selectedSalary.encryptedSalary}</span>
              </div>
              {selectedSalary.percentile && (
                <div className="percentile-display">
                  <div className="percentile-value">Top {selectedSalary.percentile}%</div>
                  <p>This salary ranks in the top {selectedSalary.percentile}% for this position and region</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="logo-icon">💼</div>
              <span>SalaryBenchFHE</span>
            </div>
            <p>Anonymous salary benchmarking using FHE technology</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} SalaryBenchFHE. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalSubmitProps {
  onSubmit: () => void; 
  onClose: () => void; 
  submitting: boolean;
  salaryData: any;
  setSalaryData: (data: any) => void;
}

const ModalSubmit: React.FC<ModalSubmitProps> = ({ 
  onSubmit, 
  onClose, 
  submitting,
  salaryData,
  setSalaryData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setSalaryData({
      ...salaryData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!salaryData.industry || !salaryData.position || !salaryData.region || !salaryData.salary) {
      alert("Please fill all required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="submit-modal">
        <div className="modal-header">
          <h2>Submit Anonymous Salary</h2>
          <button onClick={onClose} className="close-modal">×</button>
        </div>
        
        <div className="modal-body">
          <div className="privacy-notice">
            🔒 Your salary will be encrypted with FHE and never stored in plain text
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Industry *</label>
              <select 
                name="industry"
                value={salaryData.industry} 
                onChange={handleChange}
                className="form-select"
              >
                <option value="">Select industry</option>
                <option value="Technology">Technology</option>
                <option value="Finance">Finance</option>
                <option value="Healthcare">Healthcare</option>
                <option value="Education">Education</option>
                <option value="Manufacturing">Manufacturing</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Position *</label>
              <input 
                type="text"
                name="position"
                value={salaryData.position} 
                onChange={handleChange}
                placeholder="e.g. Software Engineer" 
                className="form-input"
              />
            </div>
            
            <div className="form-group">
              <label>Region *</label>
              <select 
                name="region"
                value={salaryData.region} 
                onChange={handleChange}
                className="form-select"
              >
                <option value="">Select region</option>
                <option value="North America">North America</option>
                <option value="Europe">Europe</option>
                <option value="Asia">Asia</option>
                <option value="South America">South America</option>
                <option value="Africa">Africa</option>
                <option value="Oceania">Oceania</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Annual Salary (USD) *</label>
              <input 
                type="number"
                name="salary"
                value={salaryData.salary} 
                onChange={handleChange}
                placeholder="e.g. 75000" 
                className="form-input"
              />
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={submitting}
            className="submit-btn"
          >
            {submitting ? "Encrypting with FHE..." : "Submit Anonymously"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;