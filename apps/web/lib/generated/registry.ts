// Generated from the Foundry artifact by scripts/generate-registry.mjs.
export const registryAbi = [
  {
    "type": "constructor",
    "inputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "LOT_ACCEPTANCE_TYPEHASH",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "LOT_ASSIGNMENT_TYPEHASH",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "TEST_EVIDENCE_TYPEHASH",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "acceptLot",
    "inputs": [
      {
        "name": "acceptance",
        "type": "tuple",
        "internalType": "struct PourLedgerRegistry.LotAcceptance",
        "components": [
          {
            "name": "lotId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "acceptedQuantity",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "decision",
            "type": "uint8",
            "internalType": "enum PourLedgerRegistry.LotStatus"
          },
          {
            "name": "conditionHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "inspector",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "nonce",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "deadline",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      },
      {
        "name": "signature",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "assignLotToElement",
    "inputs": [
      {
        "name": "assignment",
        "type": "tuple",
        "internalType": "struct PourLedgerRegistry.LotAssignment",
        "components": [
          {
            "name": "lotId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "elementId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "usedQuantity",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "evidenceHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "engineer",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "nonce",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "deadline",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      },
      {
        "name": "signature",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [
      {
        "name": "assignmentId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "assignmentCount",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "assignments",
    "inputs": [
      {
        "name": "assignmentId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "lotId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "elementId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "usedQuantity",
        "type": "uint128",
        "internalType": "uint128"
      },
      {
        "name": "evidenceHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "engineer",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "attachTestEvidence",
    "inputs": [
      {
        "name": "evidence",
        "type": "tuple",
        "internalType": "struct PourLedgerRegistry.TestEvidence",
        "components": [
          {
            "name": "lotId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "sampleHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "resultsHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "lab",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "nonce",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "deadline",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      },
      {
        "name": "signature",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [
      {
        "name": "testId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "createElement",
    "inputs": [
      {
        "name": "projectId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "elementCodeHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "elementType",
        "type": "uint8",
        "internalType": "uint8"
      }
    ],
    "outputs": [
      {
        "name": "elementId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "createProject",
    "inputs": [
      {
        "name": "projectHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "supervisor",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "projectId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "domainSeparatorV4",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "eip712Domain",
    "inputs": [],
    "outputs": [
      {
        "name": "fields",
        "type": "bytes1",
        "internalType": "bytes1"
      },
      {
        "name": "name",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "version",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "chainId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "verifyingContract",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "salt",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "extensions",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "elementCount",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "elementIdByCodeHash",
    "inputs": [
      {
        "name": "projectId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "elementCodeHash",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "elementId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "elements",
    "inputs": [
      {
        "name": "elementId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "projectId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "elementCodeHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "elementType",
        "type": "uint8",
        "internalType": "uint8"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "evidenceIdBySampleHash",
    "inputs": [
      {
        "name": "lotId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "sampleHash",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "testId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "evidenceRecordCount",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "hasProjectRole",
    "inputs": [
      {
        "name": "projectId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "role",
        "type": "uint8",
        "internalType": "enum PourLedgerRegistry.Role"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "labEvidenceRecords",
    "inputs": [
      {
        "name": "testId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "lotId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "sampleHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "resultsHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "lab",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "lotCount",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "lotIdByHash",
    "inputs": [
      {
        "name": "projectId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "lotHash",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "lotId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "materialLots",
    "inputs": [
      {
        "name": "lotId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "projectId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "lotHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "supplier",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "materialType",
        "type": "uint8",
        "internalType": "enum PourLedgerRegistry.MaterialType"
      },
      {
        "name": "declaredQuantity",
        "type": "uint128",
        "internalType": "uint128"
      },
      {
        "name": "acceptedQuantity",
        "type": "uint128",
        "internalType": "uint128"
      },
      {
        "name": "assignedQuantity",
        "type": "uint128",
        "internalType": "uint128"
      },
      {
        "name": "unitCode",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "status",
        "type": "uint8",
        "internalType": "enum PourLedgerRegistry.LotStatus"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "nonces",
    "inputs": [
      {
        "name": "signer",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "nonce",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "projectCount",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "projects",
    "inputs": [
      {
        "name": "projectId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "projectHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "supervisor",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "registerMaterialLot",
    "inputs": [
      {
        "name": "projectId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "lotHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "supplier",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "materialType",
        "type": "uint8",
        "internalType": "enum PourLedgerRegistry.MaterialType"
      },
      {
        "name": "quantity",
        "type": "uint128",
        "internalType": "uint128"
      },
      {
        "name": "unitCode",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "lotId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setProjectRole",
    "inputs": [
      {
        "name": "projectId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "role",
        "type": "uint8",
        "internalType": "enum PourLedgerRegistry.Role"
      },
      {
        "name": "enabled",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "EIP712DomainChanged",
    "inputs": [],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ElementCreated",
    "inputs": [
      {
        "name": "elementId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "projectId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "elementCodeHash",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "elementType",
        "type": "uint8",
        "indexed": false,
        "internalType": "uint8"
      },
      {
        "name": "creator",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "LotAssignedToElement",
    "inputs": [
      {
        "name": "assignmentId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "lotId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "elementId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "usedQuantity",
        "type": "uint128",
        "indexed": false,
        "internalType": "uint128"
      },
      {
        "name": "evidenceHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "engineer",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "LotDecisionRecorded",
    "inputs": [
      {
        "name": "lotId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "projectId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "inspector",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "decision",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum PourLedgerRegistry.LotStatus"
      },
      {
        "name": "acceptedQuantity",
        "type": "uint128",
        "indexed": false,
        "internalType": "uint128"
      },
      {
        "name": "conditionHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "MaterialLotRegistered",
    "inputs": [
      {
        "name": "lotId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "projectId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "lotHash",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "supplier",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "materialType",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum PourLedgerRegistry.MaterialType"
      },
      {
        "name": "declaredQuantity",
        "type": "uint128",
        "indexed": false,
        "internalType": "uint128"
      },
      {
        "name": "unitCode",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ProjectCreated",
    "inputs": [
      {
        "name": "projectId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "projectHash",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "supervisor",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "creator",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ProjectRoleUpdated",
    "inputs": [
      {
        "name": "projectId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "account",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "role",
        "type": "uint8",
        "indexed": true,
        "internalType": "enum PourLedgerRegistry.Role"
      },
      {
        "name": "enabled",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "TestEvidenceAttached",
    "inputs": [
      {
        "name": "testId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "lotId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "sampleHash",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "resultsHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "lab",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "DuplicateHash",
    "inputs": [
      {
        "name": "digest",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "ECDSAInvalidSignature",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ECDSAInvalidSignatureLength",
    "inputs": [
      {
        "name": "length",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ECDSAInvalidSignatureS",
    "inputs": [
      {
        "name": "s",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "ElementNotFound",
    "inputs": [
      {
        "name": "elementId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidDecisionQuantity",
    "inputs": [
      {
        "name": "decision",
        "type": "uint8",
        "internalType": "enum PourLedgerRegistry.LotStatus"
      },
      {
        "name": "quantity",
        "type": "uint128",
        "internalType": "uint128"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidField",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidLotStatus",
    "inputs": [
      {
        "name": "status",
        "type": "uint8",
        "internalType": "enum PourLedgerRegistry.LotStatus"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidNonce",
    "inputs": [
      {
        "name": "signer",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "expected",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "supplied",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidShortString",
    "inputs": []
  },
  {
    "type": "error",
    "name": "LotNotFound",
    "inputs": [
      {
        "name": "lotId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ProjectMismatch",
    "inputs": [
      {
        "name": "lotProjectId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "elementProjectId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ProjectNotFound",
    "inputs": [
      {
        "name": "projectId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "QuantityExceeded",
    "inputs": [
      {
        "name": "available",
        "type": "uint128",
        "internalType": "uint128"
      },
      {
        "name": "requested",
        "type": "uint128",
        "internalType": "uint128"
      }
    ]
  },
  {
    "type": "error",
    "name": "SignatureExpired",
    "inputs": [
      {
        "name": "deadline",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "SignerMismatch",
    "inputs": [
      {
        "name": "expected",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "recovered",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "StringTooLong",
    "inputs": [
      {
        "name": "str",
        "type": "string",
        "internalType": "string"
      }
    ]
  },
  {
    "type": "error",
    "name": "Unauthorized",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ]
  }
] as const;
export const registryTypes = {
  "LotAcceptance": [
    {
      "name": "lotId",
      "type": "uint256"
    },
    {
      "name": "acceptedQuantity",
      "type": "uint128"
    },
    {
      "name": "decision",
      "type": "uint8"
    },
    {
      "name": "conditionHash",
      "type": "bytes32"
    },
    {
      "name": "inspector",
      "type": "address"
    },
    {
      "name": "nonce",
      "type": "uint256"
    },
    {
      "name": "deadline",
      "type": "uint256"
    }
  ],
  "LotAssignment": [
    {
      "name": "lotId",
      "type": "uint256"
    },
    {
      "name": "elementId",
      "type": "uint256"
    },
    {
      "name": "usedQuantity",
      "type": "uint128"
    },
    {
      "name": "evidenceHash",
      "type": "bytes32"
    },
    {
      "name": "engineer",
      "type": "address"
    },
    {
      "name": "nonce",
      "type": "uint256"
    },
    {
      "name": "deadline",
      "type": "uint256"
    }
  ],
  "TestEvidence": [
    {
      "name": "lotId",
      "type": "uint256"
    },
    {
      "name": "sampleHash",
      "type": "bytes32"
    },
    {
      "name": "resultsHash",
      "type": "bytes32"
    },
    {
      "name": "lab",
      "type": "address"
    },
    {
      "name": "nonce",
      "type": "uint256"
    },
    {
      "name": "deadline",
      "type": "uint256"
    }
  ]
} as const;
