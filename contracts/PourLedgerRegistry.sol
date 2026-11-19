// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/// @title PourLedgerRegistry
/// @notice Records role-bound evidence links from construction material lots to structural elements.
/// @dev Digests and signatures are evidence of attestations, not proof of physical facts or safety.
contract PourLedgerRegistry is EIP712 {
    enum Role {
        NONE,
        INSPECTOR,
        ENGINEER,
        LAB
    }

    enum MaterialType {
        OTHER,
        REBAR,
        CEMENT,
        COARSE_AGGREGATE,
        FINE_AGGREGATE,
        READY_MIX
    }

    enum LotStatus {
        NONE,
        REGISTERED,
        ACCEPTED,
        PARTIALLY_ACCEPTED,
        REJECTED
    }

    struct Project {
        bytes32 projectHash;
        address supervisor;
    }

    struct Element {
        uint256 projectId;
        bytes32 elementCodeHash;
        uint8 elementType;
    }

    struct MaterialLot {
        uint256 projectId;
        bytes32 lotHash;
        address supplier;
        MaterialType materialType;
        uint128 declaredQuantity;
        uint128 acceptedQuantity;
        uint128 assignedQuantity;
        bytes32 unitCode;
        LotStatus status;
    }

    struct AssignmentRecord {
        uint256 lotId;
        uint256 elementId;
        uint128 usedQuantity;
        bytes32 evidenceHash;
        address engineer;
    }

    struct TestRecord {
        uint256 lotId;
        bytes32 sampleHash;
        bytes32 resultsHash;
        address lab;
    }

    struct LotAcceptance {
        uint256 lotId;
        uint128 acceptedQuantity;
        LotStatus decision;
        bytes32 conditionHash;
        address inspector;
        uint256 nonce;
        uint256 deadline;
    }

    struct LotAssignment {
        uint256 lotId;
        uint256 elementId;
        uint128 usedQuantity;
        bytes32 evidenceHash;
        address engineer;
        uint256 nonce;
        uint256 deadline;
    }

    struct TestEvidence {
        uint256 lotId;
        bytes32 sampleHash;
        bytes32 resultsHash;
        address lab;
        uint256 nonce;
        uint256 deadline;
    }

    error ProjectNotFound(uint256 projectId);
    error ElementNotFound(uint256 elementId);
    error LotNotFound(uint256 lotId);
    error Unauthorized(address account);
    error InvalidField();
    error DuplicateHash(bytes32 digest);
    error InvalidLotStatus(LotStatus status);
    error InvalidDecisionQuantity(LotStatus decision, uint128 quantity);
    error ProjectMismatch(uint256 lotProjectId, uint256 elementProjectId);
    error QuantityExceeded(uint128 available, uint128 requested);
    error SignatureExpired(uint256 deadline);
    error InvalidNonce(address signer, uint256 expected, uint256 supplied);
    error SignerMismatch(address expected, address recovered);

    event ProjectCreated(
        uint256 indexed projectId,
        bytes32 indexed projectHash,
        address indexed supervisor,
        address creator
    );
    event ProjectRoleUpdated(
        uint256 indexed projectId, address indexed account, Role indexed role, bool enabled
    );
    event ElementCreated(
        uint256 indexed elementId,
        uint256 indexed projectId,
        bytes32 indexed elementCodeHash,
        uint8 elementType,
        address creator
    );
    event MaterialLotRegistered(
        uint256 indexed lotId,
        uint256 indexed projectId,
        bytes32 indexed lotHash,
        address supplier,
        MaterialType materialType,
        uint128 declaredQuantity,
        bytes32 unitCode
    );
    event LotDecisionRecorded(
        uint256 indexed lotId,
        uint256 indexed projectId,
        address indexed inspector,
        LotStatus decision,
        uint128 acceptedQuantity,
        bytes32 conditionHash
    );
    event LotAssignedToElement(
        uint256 indexed assignmentId,
        uint256 indexed lotId,
        uint256 indexed elementId,
        uint128 usedQuantity,
        bytes32 evidenceHash,
        address engineer
    );
    event TestEvidenceAttached(
        uint256 indexed testId,
        uint256 indexed lotId,
        bytes32 indexed sampleHash,
        bytes32 resultsHash,
        address lab
    );

    bytes32 public constant LOT_ACCEPTANCE_TYPEHASH = keccak256(
        "LotAcceptance(uint256 lotId,uint128 acceptedQuantity,uint8 decision,bytes32 conditionHash,address inspector,uint256 nonce,uint256 deadline)"
    );
    bytes32 public constant LOT_ASSIGNMENT_TYPEHASH = keccak256(
        "LotAssignment(uint256 lotId,uint256 elementId,uint128 usedQuantity,bytes32 evidenceHash,address engineer,uint256 nonce,uint256 deadline)"
    );
    bytes32 public constant TEST_EVIDENCE_TYPEHASH = keccak256(
        "TestEvidence(uint256 lotId,bytes32 sampleHash,bytes32 resultsHash,address lab,uint256 nonce,uint256 deadline)"
    );

    uint256 public projectCount;
    uint256 public elementCount;
    uint256 public lotCount;
    uint256 public assignmentCount;
    uint256 public evidenceRecordCount;

    mapping(uint256 projectId => Project project) public projects;
    mapping(
        uint256 projectId => mapping(address account => mapping(Role role => bool enabled))
    ) private _projectRoles;
    mapping(uint256 elementId => Element element) public elements;
    mapping(uint256 projectId => mapping(bytes32 elementCodeHash => uint256 elementId)) public
        elementIdByCodeHash;
    mapping(uint256 lotId => MaterialLot lot) public materialLots;
    mapping(uint256 projectId => mapping(bytes32 lotHash => uint256 lotId)) public lotIdByHash;
    mapping(uint256 assignmentId => AssignmentRecord assignment) public assignments;
    mapping(uint256 testId => TestRecord testRecord) public labEvidenceRecords;
    mapping(uint256 lotId => mapping(bytes32 sampleHash => uint256 testId)) public
        evidenceIdBySampleHash;
    mapping(address signer => uint256 nonce) public nonces;

    constructor() EIP712("PourLedgerRegistry", "1") { }

    function createProject(bytes32 projectHash, address supervisor)
        external
        returns (uint256 projectId)
    {
        if (projectHash == bytes32(0) || supervisor == address(0)) revert InvalidField();

        projectId = ++projectCount;
        projects[projectId] = Project({ projectHash: projectHash, supervisor: supervisor });
        emit ProjectCreated(projectId, projectHash, supervisor, msg.sender);
    }

    function setProjectRole(uint256 projectId, address account, Role role, bool enabled) external {
        Project storage project = _requireProject(projectId);
        if (msg.sender != project.supervisor) revert Unauthorized(msg.sender);
        if (account == address(0) || role == Role.NONE) revert InvalidField();

        _projectRoles[projectId][account][role] = enabled;
        emit ProjectRoleUpdated(projectId, account, role, enabled);
    }

    function hasProjectRole(uint256 projectId, address account, Role role)
        public
        view
        returns (bool)
    {
        return _projectRoles[projectId][account][role];
    }

    function createElement(uint256 projectId, bytes32 elementCodeHash, uint8 elementType)
        external
        returns (uint256 elementId)
    {
        Project storage project = _requireProject(projectId);
        if (
            msg.sender != project.supervisor
                && !hasProjectRole(projectId, msg.sender, Role.ENGINEER)
        ) revert Unauthorized(msg.sender);
        if (elementCodeHash == bytes32(0)) revert InvalidField();
        if (elementIdByCodeHash[projectId][elementCodeHash] != 0) {
            revert DuplicateHash(elementCodeHash);
        }

        elementId = ++elementCount;
        elements[elementId] = Element({
            projectId: projectId, elementCodeHash: elementCodeHash, elementType: elementType
        });
        elementIdByCodeHash[projectId][elementCodeHash] = elementId;
        emit ElementCreated(elementId, projectId, elementCodeHash, elementType, msg.sender);
    }

    function registerMaterialLot(
        uint256 projectId,
        bytes32 lotHash,
        address supplier,
        MaterialType materialType,
        uint128 quantity,
        bytes32 unitCode
    ) external returns (uint256 lotId) {
        Project storage project = _requireProject(projectId);
        if (msg.sender != project.supervisor && msg.sender != supplier) {
            revert Unauthorized(msg.sender);
        }
        if (
            lotHash == bytes32(0) || supplier == address(0) || quantity == 0
                || unitCode == bytes32(0)
        ) revert InvalidField();
        if (lotIdByHash[projectId][lotHash] != 0) revert DuplicateHash(lotHash);

        lotId = ++lotCount;
        materialLots[lotId] = MaterialLot({
            projectId: projectId,
            lotHash: lotHash,
            supplier: supplier,
            materialType: materialType,
            declaredQuantity: quantity,
            acceptedQuantity: 0,
            assignedQuantity: 0,
            unitCode: unitCode,
            status: LotStatus.REGISTERED
        });
        lotIdByHash[projectId][lotHash] = lotId;
        emit MaterialLotRegistered(
            lotId, projectId, lotHash, supplier, materialType, quantity, unitCode
        );
    }

    function acceptLot(LotAcceptance calldata acceptance, bytes calldata signature) external {
        MaterialLot storage lot = _requireLot(acceptance.lotId);
        if (lot.status != LotStatus.REGISTERED) revert InvalidLotStatus(lot.status);
        if (acceptance.conditionHash == bytes32(0)) revert InvalidField();
        _validateDecision(lot.declaredQuantity, acceptance.decision, acceptance.acceptedQuantity);

        bytes32 structHash = keccak256(
            abi.encode(
                LOT_ACCEPTANCE_TYPEHASH,
                acceptance.lotId,
                acceptance.acceptedQuantity,
                uint8(acceptance.decision),
                acceptance.conditionHash,
                acceptance.inspector,
                acceptance.nonce,
                acceptance.deadline
            )
        );
        _consumeSignature(
            lot.projectId,
            acceptance.inspector,
            Role.INSPECTOR,
            acceptance.nonce,
            acceptance.deadline,
            structHash,
            signature
        );

        lot.acceptedQuantity = acceptance.acceptedQuantity;
        lot.status = acceptance.decision;
        emit LotDecisionRecorded(
            acceptance.lotId,
            lot.projectId,
            acceptance.inspector,
            acceptance.decision,
            acceptance.acceptedQuantity,
            acceptance.conditionHash
        );
    }

    function assignLotToElement(LotAssignment calldata assignment, bytes calldata signature)
        external
        returns (uint256 assignmentId)
    {
        MaterialLot storage lot = _requireLot(assignment.lotId);
        Element storage element = _requireElement(assignment.elementId);
        if (lot.projectId != element.projectId) {
            revert ProjectMismatch(lot.projectId, element.projectId);
        }
        if (lot.status != LotStatus.ACCEPTED && lot.status != LotStatus.PARTIALLY_ACCEPTED) {
            revert InvalidLotStatus(lot.status);
        }
        if (assignment.usedQuantity == 0 || assignment.evidenceHash == bytes32(0)) {
            revert InvalidField();
        }
        uint256 newAssigned = uint256(lot.assignedQuantity) + assignment.usedQuantity;
        if (newAssigned > lot.acceptedQuantity) {
            revert QuantityExceeded(
                lot.acceptedQuantity - lot.assignedQuantity, assignment.usedQuantity
            );
        }

        bytes32 structHash = keccak256(
            abi.encode(
                LOT_ASSIGNMENT_TYPEHASH,
                assignment.lotId,
                assignment.elementId,
                assignment.usedQuantity,
                assignment.evidenceHash,
                assignment.engineer,
                assignment.nonce,
                assignment.deadline
            )
        );
        _consumeSignature(
            lot.projectId,
            assignment.engineer,
            Role.ENGINEER,
            assignment.nonce,
            assignment.deadline,
            structHash,
            signature
        );

        // Safe because the comparison above bounds newAssigned by the uint128 accepted quantity.
        // forge-lint: disable-next-line(unsafe-typecast)
        lot.assignedQuantity = uint128(newAssigned);
        assignmentId = ++assignmentCount;
        assignments[assignmentId] = AssignmentRecord({
            lotId: assignment.lotId,
            elementId: assignment.elementId,
            usedQuantity: assignment.usedQuantity,
            evidenceHash: assignment.evidenceHash,
            engineer: assignment.engineer
        });
        emit LotAssignedToElement(
            assignmentId,
            assignment.lotId,
            assignment.elementId,
            assignment.usedQuantity,
            assignment.evidenceHash,
            assignment.engineer
        );
    }

    function attachTestEvidence(TestEvidence calldata evidence, bytes calldata signature)
        external
        returns (uint256 testId)
    {
        MaterialLot storage lot = _requireLot(evidence.lotId);
        if (evidence.sampleHash == bytes32(0) || evidence.resultsHash == bytes32(0)) {
            revert InvalidField();
        }
        if (evidenceIdBySampleHash[evidence.lotId][evidence.sampleHash] != 0) {
            revert DuplicateHash(evidence.sampleHash);
        }

        bytes32 structHash = keccak256(
            abi.encode(
                TEST_EVIDENCE_TYPEHASH,
                evidence.lotId,
                evidence.sampleHash,
                evidence.resultsHash,
                evidence.lab,
                evidence.nonce,
                evidence.deadline
            )
        );
        _consumeSignature(
            lot.projectId,
            evidence.lab,
            Role.LAB,
            evidence.nonce,
            evidence.deadline,
            structHash,
            signature
        );

        testId = ++evidenceRecordCount;
        labEvidenceRecords[testId] = TestRecord({
            lotId: evidence.lotId,
            sampleHash: evidence.sampleHash,
            resultsHash: evidence.resultsHash,
            lab: evidence.lab
        });
        evidenceIdBySampleHash[evidence.lotId][evidence.sampleHash] = testId;
        emit TestEvidenceAttached(
            testId, evidence.lotId, evidence.sampleHash, evidence.resultsHash, evidence.lab
        );
    }

    function domainSeparatorV4() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function _validateDecision(
        uint128 declaredQuantity,
        LotStatus decision,
        uint128 acceptedQuantity
    ) private pure {
        bool valid =
            (decision == LotStatus.ACCEPTED && acceptedQuantity == declaredQuantity)
                || (decision == LotStatus.PARTIALLY_ACCEPTED
                    && acceptedQuantity > 0
                    && acceptedQuantity < declaredQuantity)
                || (decision == LotStatus.REJECTED && acceptedQuantity == 0);
        if (!valid) revert InvalidDecisionQuantity(decision, acceptedQuantity);
    }

    function _consumeSignature(
        uint256 projectId,
        address claimedSigner,
        Role requiredRole,
        uint256 suppliedNonce,
        uint256 deadline,
        bytes32 structHash,
        bytes calldata signature
    ) private {
        if (claimedSigner == address(0)) revert InvalidField();
        // A small validator timestamp tolerance is acceptable; the deadline only limits staleness.
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > deadline) revert SignatureExpired(deadline);

        uint256 expectedNonce = nonces[claimedSigner];
        if (suppliedNonce != expectedNonce) {
            revert InvalidNonce(claimedSigner, expectedNonce, suppliedNonce);
        }

        address recovered = ECDSA.recover(_hashTypedDataV4(structHash), signature);
        if (recovered != claimedSigner) revert SignerMismatch(claimedSigner, recovered);
        if (!hasProjectRole(projectId, claimedSigner, requiredRole)) {
            revert Unauthorized(claimedSigner);
        }

        nonces[claimedSigner] = expectedNonce + 1;
    }

    function _requireProject(uint256 projectId) private view returns (Project storage project) {
        project = projects[projectId];
        if (project.supervisor == address(0)) revert ProjectNotFound(projectId);
    }

    function _requireElement(uint256 elementId) private view returns (Element storage element) {
        element = elements[elementId];
        if (element.projectId == 0) revert ElementNotFound(elementId);
    }

    function _requireLot(uint256 lotId) private view returns (MaterialLot storage lot) {
        lot = materialLots[lotId];
        if (lot.projectId == 0) revert LotNotFound(lotId);
    }
}
