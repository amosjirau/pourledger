// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { PourLedgerRegistry } from "../contracts/PourLedgerRegistry.sol";

contract PourLedgerRegistryTest is Test {
    PourLedgerRegistry internal registry;

    uint256 internal constant INSPECTOR_KEY = 0xA11CE;
    uint256 internal constant ENGINEER_KEY = 0xB0B;
    uint256 internal constant LAB_KEY = 0x1AB;
    uint256 internal constant OUTSIDER_KEY = 0xBAD;

    address internal inspector;
    address internal engineer;
    address internal lab;
    address internal outsider;
    address internal supplier;

    uint256 internal projectId;
    uint256 internal elementId;
    uint256 internal lotId;

    bytes32 internal domainSeparator;
    bytes32 internal acceptanceTypeHash;
    bytes32 internal assignmentTypeHash;
    bytes32 internal evidenceTypeHash;

    bytes32 internal constant PROJECT_HASH = keccak256("Demo Project");
    bytes32 internal constant ELEMENT_HASH = keccak256("B1");
    bytes32 internal constant LOT_HASH = keccak256("LOT-001");
    bytes32 internal constant UNIT_KG = keccak256("kg");
    bytes32 internal constant CONDITION_HASH = keccak256("delivery-note");
    bytes32 internal constant EVIDENCE_HASH = keccak256("placement-photo");
    bytes32 internal constant SAMPLE_HASH = keccak256("sample-01");
    bytes32 internal constant RESULTS_HASH = keccak256("result-document");

    function setUp() public {
        vm.warp(1_000_000);
        registry = new PourLedgerRegistry();
        domainSeparator = registry.domainSeparatorV4();
        acceptanceTypeHash = registry.LOT_ACCEPTANCE_TYPEHASH();
        assignmentTypeHash = registry.LOT_ASSIGNMENT_TYPEHASH();
        evidenceTypeHash = registry.TEST_EVIDENCE_TYPEHASH();
        inspector = vm.addr(INSPECTOR_KEY);
        engineer = vm.addr(ENGINEER_KEY);
        lab = vm.addr(LAB_KEY);
        outsider = vm.addr(OUTSIDER_KEY);
        supplier = makeAddr("supplier");

        projectId = registry.createProject(PROJECT_HASH, address(this));
        registry.setProjectRole(projectId, inspector, PourLedgerRegistry.Role.INSPECTOR, true);
        registry.setProjectRole(projectId, engineer, PourLedgerRegistry.Role.ENGINEER, true);
        registry.setProjectRole(projectId, lab, PourLedgerRegistry.Role.LAB, true);
        elementId = registry.createElement(projectId, ELEMENT_HASH, 3);
        lotId = registry.registerMaterialLot(
            projectId, LOT_HASH, supplier, PourLedgerRegistry.MaterialType.REBAR, 100, UNIT_KG
        );
    }

    function test_FullEvidenceFlowStoresRelationshipsAndConsumesNonces() public {
        _accept(lotId, 100, PourLedgerRegistry.LotStatus.ACCEPTED);

        PourLedgerRegistry.LotAssignment memory assignment = _assignment(
            lotId, elementId, 60, engineer, registry.nonces(engineer), block.timestamp + 1 hours
        );
        uint256 assignmentId =
            registry.assignLotToElement(assignment, _signAssignment(assignment, ENGINEER_KEY));

        PourLedgerRegistry.TestEvidence memory evidence = _evidence(
            lotId, SAMPLE_HASH, RESULTS_HASH, lab, registry.nonces(lab), block.timestamp + 1 hours
        );
        uint256 testId = registry.attachTestEvidence(evidence, _signEvidence(evidence, LAB_KEY));

        (
            ,,,,
            uint128 declaredQuantity,
            uint128 acceptedQuantity,
            uint128 assignedQuantity,,
            PourLedgerRegistry.LotStatus status
        ) = registry.materialLots(lotId);
        assertEq(declaredQuantity, 100);
        assertEq(acceptedQuantity, 100);
        assertEq(assignedQuantity, 60);
        assertEq(uint8(status), uint8(PourLedgerRegistry.LotStatus.ACCEPTED));
        assertEq(assignmentId, 1);
        assertEq(testId, 1);
        assertEq(registry.nonces(inspector), 1);
        assertEq(registry.nonces(engineer), 1);
        assertEq(registry.nonces(lab), 1);

        (
            uint256 storedLotId,
            uint256 storedElementId,
            uint128 used,
            bytes32 digest,
            address signer
        ) = registry.assignments(assignmentId);
        assertEq(storedLotId, lotId);
        assertEq(storedElementId, elementId);
        assertEq(used, 60);
        assertEq(digest, EVIDENCE_HASH);
        assertEq(signer, engineer);
    }

    function test_RevertWhenProjectFieldsAreZero() public {
        vm.expectRevert(PourLedgerRegistry.InvalidField.selector);
        registry.createProject(bytes32(0), address(this));
        vm.expectRevert(PourLedgerRegistry.InvalidField.selector);
        registry.createProject(keccak256("project"), address(0));
    }

    function test_RevertWhenNonSupervisorOrInvalidAccountChangesRole() public {
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(PourLedgerRegistry.Unauthorized.selector, outsider));
        registry.setProjectRole(projectId, outsider, PourLedgerRegistry.Role.LAB, true);

        vm.expectRevert(PourLedgerRegistry.InvalidField.selector);
        registry.setProjectRole(projectId, address(0), PourLedgerRegistry.Role.LAB, true);
        vm.expectRevert(PourLedgerRegistry.InvalidField.selector);
        registry.setProjectRole(projectId, outsider, PourLedgerRegistry.Role.NONE, true);
    }

    function test_RevertWhenElementCreatorUnauthorizedOrCodeDuplicated() public {
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(PourLedgerRegistry.Unauthorized.selector, outsider));
        registry.createElement(projectId, keccak256("C1"), 2);

        vm.expectRevert(
            abi.encodeWithSelector(PourLedgerRegistry.DuplicateHash.selector, ELEMENT_HASH)
        );
        registry.createElement(projectId, ELEMENT_HASH, 3);
    }

    function test_RevertWhenLotRegistrationUnauthorizedInvalidOrDuplicated() public {
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(PourLedgerRegistry.Unauthorized.selector, outsider));
        registry.registerMaterialLot(
            projectId,
            keccak256("other"),
            supplier,
            PourLedgerRegistry.MaterialType.CEMENT,
            1,
            UNIT_KG
        );

        vm.expectRevert(PourLedgerRegistry.InvalidField.selector);
        registry.registerMaterialLot(
            projectId,
            keccak256("zero-quantity"),
            supplier,
            PourLedgerRegistry.MaterialType.CEMENT,
            0,
            UNIT_KG
        );

        vm.expectRevert(abi.encodeWithSelector(PourLedgerRegistry.DuplicateHash.selector, LOT_HASH));
        registry.registerMaterialLot(
            projectId, LOT_HASH, supplier, PourLedgerRegistry.MaterialType.REBAR, 100, UNIT_KG
        );
    }

    function test_RevertAcceptanceForMissingLotOrZeroCondition() public {
        PourLedgerRegistry.LotAcceptance memory missing = _acceptance(
            999,
            1,
            PourLedgerRegistry.LotStatus.ACCEPTED,
            CONDITION_HASH,
            inspector,
            0,
            block.timestamp + 1 hours
        );
        vm.expectRevert(abi.encodeWithSelector(PourLedgerRegistry.LotNotFound.selector, 999));
        registry.acceptLot(missing, _signAcceptance(missing, INSPECTOR_KEY));

        PourLedgerRegistry.LotAcceptance memory zeroCondition = _acceptance(
            lotId,
            100,
            PourLedgerRegistry.LotStatus.ACCEPTED,
            bytes32(0),
            inspector,
            0,
            block.timestamp + 1 hours
        );
        vm.expectRevert(PourLedgerRegistry.InvalidField.selector);
        registry.acceptLot(zeroCondition, _signAcceptance(zeroCondition, INSPECTOR_KEY));
    }

    function test_RevertAcceptanceWithInvalidDecisionQuantities() public {
        _expectInvalidDecision(PourLedgerRegistry.LotStatus.ACCEPTED, 99);
        _expectInvalidDecision(PourLedgerRegistry.LotStatus.PARTIALLY_ACCEPTED, 0);
        _expectInvalidDecision(PourLedgerRegistry.LotStatus.PARTIALLY_ACCEPTED, 100);
        _expectInvalidDecision(PourLedgerRegistry.LotStatus.REJECTED, 1);
        _expectInvalidDecision(PourLedgerRegistry.LotStatus.REGISTERED, 100);
    }

    function test_RevertAcceptanceFromUnauthorizedOrRevokedInspector() public {
        PourLedgerRegistry.LotAcceptance memory unauthorized = _acceptance(
            lotId,
            100,
            PourLedgerRegistry.LotStatus.ACCEPTED,
            CONDITION_HASH,
            outsider,
            0,
            block.timestamp + 1 hours
        );
        vm.expectRevert(abi.encodeWithSelector(PourLedgerRegistry.Unauthorized.selector, outsider));
        registry.acceptLot(unauthorized, _signAcceptance(unauthorized, OUTSIDER_KEY));

        PourLedgerRegistry.LotAcceptance memory revoked = _acceptance(
            lotId,
            100,
            PourLedgerRegistry.LotStatus.ACCEPTED,
            CONDITION_HASH,
            inspector,
            0,
            block.timestamp + 1 hours
        );
        bytes memory signature = _signAcceptance(revoked, INSPECTOR_KEY);
        registry.setProjectRole(projectId, inspector, PourLedgerRegistry.Role.INSPECTOR, false);
        vm.expectRevert(abi.encodeWithSelector(PourLedgerRegistry.Unauthorized.selector, inspector));
        registry.acceptLot(revoked, signature);
    }

    function test_RevertAcceptanceWhenExpiredOrNonceIsWrong() public {
        PourLedgerRegistry.LotAcceptance memory expired = _acceptance(
            lotId,
            100,
            PourLedgerRegistry.LotStatus.ACCEPTED,
            CONDITION_HASH,
            inspector,
            0,
            block.timestamp - 1
        );
        vm.expectRevert(
            abi.encodeWithSelector(PourLedgerRegistry.SignatureExpired.selector, expired.deadline)
        );
        registry.acceptLot(expired, _signAcceptance(expired, INSPECTOR_KEY));

        PourLedgerRegistry.LotAcceptance memory wrongNonce = _acceptance(
            lotId,
            100,
            PourLedgerRegistry.LotStatus.ACCEPTED,
            CONDITION_HASH,
            inspector,
            9,
            block.timestamp + 1 hours
        );
        vm.expectRevert(
            abi.encodeWithSelector(PourLedgerRegistry.InvalidNonce.selector, inspector, 0, 9)
        );
        registry.acceptLot(wrongNonce, _signAcceptance(wrongNonce, INSPECTOR_KEY));
    }

    function test_RevertAcceptanceForWrongSignerOrDomain() public {
        PourLedgerRegistry.LotAcceptance memory acceptance = _acceptance(
            lotId,
            100,
            PourLedgerRegistry.LotStatus.ACCEPTED,
            CONDITION_HASH,
            inspector,
            0,
            block.timestamp + 1 hours
        );

        bytes memory wrongSigner = _signAcceptance(acceptance, OUTSIDER_KEY);
        address recoveredWrongSigner = vm.addr(OUTSIDER_KEY);
        vm.expectRevert(
            abi.encodeWithSelector(
                PourLedgerRegistry.SignerMismatch.selector, inspector, recoveredWrongSigner
            )
        );
        registry.acceptLot(acceptance, wrongSigner);

        bytes memory wrongDomain =
            _signAcceptanceForChain(acceptance, INSPECTOR_KEY, block.chainid + 1);
        bytes32 structHash = keccak256(
            abi.encode(
                acceptanceTypeHash,
                acceptance.lotId,
                acceptance.acceptedQuantity,
                uint8(acceptance.decision),
                acceptance.conditionHash,
                acceptance.inspector,
                acceptance.nonce,
                acceptance.deadline
            )
        );
        address wrongDomainRecovery = ECDSA.recover(
            keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash)), wrongDomain
        );
        vm.expectRevert(
            abi.encodeWithSelector(
                PourLedgerRegistry.SignerMismatch.selector, inspector, wrongDomainRecovery
            )
        );
        registry.acceptLot(acceptance, wrongDomain);
    }

    function test_RevertDuplicateTerminalDecisionAndNonceReplay() public {
        PourLedgerRegistry.LotAcceptance memory acceptance = _acceptance(
            lotId,
            100,
            PourLedgerRegistry.LotStatus.ACCEPTED,
            CONDITION_HASH,
            inspector,
            0,
            block.timestamp + 1 hours
        );
        bytes memory signature = _signAcceptance(acceptance, INSPECTOR_KEY);
        registry.acceptLot(acceptance, signature);

        vm.expectRevert(
            abi.encodeWithSelector(
                PourLedgerRegistry.InvalidLotStatus.selector, PourLedgerRegistry.LotStatus.ACCEPTED
            )
        );
        registry.acceptLot(acceptance, signature);
    }

    function test_RejectedOrRegisteredLotCannotBeAssigned() public {
        PourLedgerRegistry.LotAssignment memory registeredAssignment =
            _assignment(lotId, elementId, 1, engineer, 0, block.timestamp + 1 hours);
        vm.expectRevert(
            abi.encodeWithSelector(
                PourLedgerRegistry.InvalidLotStatus.selector,
                PourLedgerRegistry.LotStatus.REGISTERED
            )
        );
        registry.assignLotToElement(
            registeredAssignment, _signAssignment(registeredAssignment, ENGINEER_KEY)
        );

        _accept(lotId, 0, PourLedgerRegistry.LotStatus.REJECTED);
        PourLedgerRegistry.LotAssignment memory rejectedAssignment =
            _assignment(lotId, elementId, 1, engineer, 0, block.timestamp + 1 hours);
        vm.expectRevert(
            abi.encodeWithSelector(
                PourLedgerRegistry.InvalidLotStatus.selector, PourLedgerRegistry.LotStatus.REJECTED
            )
        );
        registry.assignLotToElement(
            rejectedAssignment, _signAssignment(rejectedAssignment, ENGINEER_KEY)
        );
    }

    function test_RevertAssignmentAcrossProjectsOrMissingEntities() public {
        _accept(lotId, 100, PourLedgerRegistry.LotStatus.ACCEPTED);
        uint256 secondProject = registry.createProject(keccak256("second"), address(this));
        uint256 secondElement = registry.createElement(secondProject, keccak256("F1"), 1);

        PourLedgerRegistry.LotAssignment memory mismatch =
            _assignment(lotId, secondElement, 1, engineer, 0, block.timestamp + 1 hours);
        vm.expectRevert(
            abi.encodeWithSelector(
                PourLedgerRegistry.ProjectMismatch.selector, projectId, secondProject
            )
        );
        registry.assignLotToElement(mismatch, _signAssignment(mismatch, ENGINEER_KEY));

        PourLedgerRegistry.LotAssignment memory missingLot =
            _assignment(999, elementId, 1, engineer, 0, block.timestamp + 1 hours);
        vm.expectRevert(abi.encodeWithSelector(PourLedgerRegistry.LotNotFound.selector, 999));
        registry.assignLotToElement(missingLot, _signAssignment(missingLot, ENGINEER_KEY));

        PourLedgerRegistry.LotAssignment memory missingElement =
            _assignment(lotId, 999, 1, engineer, 0, block.timestamp + 1 hours);
        vm.expectRevert(abi.encodeWithSelector(PourLedgerRegistry.ElementNotFound.selector, 999));
        registry.assignLotToElement(missingElement, _signAssignment(missingElement, ENGINEER_KEY));
    }

    function test_RevertAssignmentWithZeroFieldsOrCumulativeOverflow() public {
        _accept(lotId, 50, PourLedgerRegistry.LotStatus.PARTIALLY_ACCEPTED);

        PourLedgerRegistry.LotAssignment memory zeroQuantity =
            _assignment(lotId, elementId, 0, engineer, 0, block.timestamp + 1 hours);
        vm.expectRevert(PourLedgerRegistry.InvalidField.selector);
        registry.assignLotToElement(zeroQuantity, _signAssignment(zeroQuantity, ENGINEER_KEY));

        PourLedgerRegistry.LotAssignment memory first =
            _assignment(lotId, elementId, 40, engineer, 0, block.timestamp + 1 hours);
        registry.assignLotToElement(first, _signAssignment(first, ENGINEER_KEY));

        PourLedgerRegistry.LotAssignment memory overflow =
            _assignment(lotId, elementId, 11, engineer, 1, block.timestamp + 1 hours);
        vm.expectRevert(
            abi.encodeWithSelector(PourLedgerRegistry.QuantityExceeded.selector, 10, 11)
        );
        registry.assignLotToElement(overflow, _signAssignment(overflow, ENGINEER_KEY));
    }

    function test_RevertAssignmentFromUnauthorizedRevokedExpiredOrReplayedEngineer() public {
        _accept(lotId, 100, PourLedgerRegistry.LotStatus.ACCEPTED);

        PourLedgerRegistry.LotAssignment memory unauthorized =
            _assignment(lotId, elementId, 1, outsider, 0, block.timestamp + 1 hours);
        vm.expectRevert(abi.encodeWithSelector(PourLedgerRegistry.Unauthorized.selector, outsider));
        registry.assignLotToElement(unauthorized, _signAssignment(unauthorized, OUTSIDER_KEY));

        PourLedgerRegistry.LotAssignment memory revoked =
            _assignment(lotId, elementId, 1, engineer, 0, block.timestamp + 1 hours);
        bytes memory revokedSignature = _signAssignment(revoked, ENGINEER_KEY);
        registry.setProjectRole(projectId, engineer, PourLedgerRegistry.Role.ENGINEER, false);
        vm.expectRevert(abi.encodeWithSelector(PourLedgerRegistry.Unauthorized.selector, engineer));
        registry.assignLotToElement(revoked, revokedSignature);
        registry.setProjectRole(projectId, engineer, PourLedgerRegistry.Role.ENGINEER, true);

        PourLedgerRegistry.LotAssignment memory expired =
            _assignment(lotId, elementId, 1, engineer, 0, block.timestamp - 1);
        vm.expectRevert(
            abi.encodeWithSelector(PourLedgerRegistry.SignatureExpired.selector, expired.deadline)
        );
        registry.assignLotToElement(expired, _signAssignment(expired, ENGINEER_KEY));

        PourLedgerRegistry.LotAssignment memory valid =
            _assignment(lotId, elementId, 1, engineer, 0, block.timestamp + 1 hours);
        bytes memory signature = _signAssignment(valid, ENGINEER_KEY);
        registry.assignLotToElement(valid, signature);
        vm.expectRevert(
            abi.encodeWithSelector(PourLedgerRegistry.InvalidNonce.selector, engineer, 1, 0)
        );
        registry.assignLotToElement(valid, signature);
    }

    function test_AssignmentGasRemainsBoundedAfterManyLinks() public {
        _accept(lotId, 100, PourLedgerRegistry.LotStatus.ACCEPTED);
        for (uint256 i = 0; i < 32; ++i) {
            PourLedgerRegistry.LotAssignment memory prior = _assignment(
                lotId, elementId, 1, engineer, registry.nonces(engineer), block.timestamp + 1 hours
            );
            registry.assignLotToElement(prior, _signAssignment(prior, ENGINEER_KEY));
        }

        PourLedgerRegistry.LotAssignment memory measured = _assignment(
            lotId, elementId, 1, engineer, registry.nonces(engineer), block.timestamp + 1 hours
        );
        bytes memory signature = _signAssignment(measured, ENGINEER_KEY);
        uint256 gasBefore = gasleft();
        registry.assignLotToElement(measured, signature);
        uint256 gasUsed = gasBefore - gasleft();
        emit log_named_uint("assignment gas after 32 links", gasUsed);
        assertLt(gasUsed, 200_000);
    }

    function test_RevertTestEvidenceForMissingLotZeroFieldsOrUnauthorizedLab() public {
        PourLedgerRegistry.TestEvidence memory missing =
            _evidence(999, SAMPLE_HASH, RESULTS_HASH, lab, 0, block.timestamp + 1 hours);
        vm.expectRevert(abi.encodeWithSelector(PourLedgerRegistry.LotNotFound.selector, 999));
        registry.attachTestEvidence(missing, _signEvidence(missing, LAB_KEY));

        PourLedgerRegistry.TestEvidence memory zeroResult =
            _evidence(lotId, SAMPLE_HASH, bytes32(0), lab, 0, block.timestamp + 1 hours);
        vm.expectRevert(PourLedgerRegistry.InvalidField.selector);
        registry.attachTestEvidence(zeroResult, _signEvidence(zeroResult, LAB_KEY));

        PourLedgerRegistry.TestEvidence memory unauthorized =
            _evidence(lotId, SAMPLE_HASH, RESULTS_HASH, outsider, 0, block.timestamp + 1 hours);
        vm.expectRevert(abi.encodeWithSelector(PourLedgerRegistry.Unauthorized.selector, outsider));
        registry.attachTestEvidence(unauthorized, _signEvidence(unauthorized, OUTSIDER_KEY));
    }

    function test_RevertTestEvidenceFromRevokedLabOrDuplicateSample() public {
        PourLedgerRegistry.TestEvidence memory revoked =
            _evidence(lotId, SAMPLE_HASH, RESULTS_HASH, lab, 0, block.timestamp + 1 hours);
        bytes memory signature = _signEvidence(revoked, LAB_KEY);
        registry.setProjectRole(projectId, lab, PourLedgerRegistry.Role.LAB, false);
        vm.expectRevert(abi.encodeWithSelector(PourLedgerRegistry.Unauthorized.selector, lab));
        registry.attachTestEvidence(revoked, signature);
        registry.setProjectRole(projectId, lab, PourLedgerRegistry.Role.LAB, true);

        registry.attachTestEvidence(revoked, signature);
        PourLedgerRegistry.TestEvidence memory duplicate = _evidence(
            lotId, SAMPLE_HASH, keccak256("other-result"), lab, 1, block.timestamp + 1 hours
        );
        vm.expectRevert(
            abi.encodeWithSelector(PourLedgerRegistry.DuplicateHash.selector, SAMPLE_HASH)
        );
        registry.attachTestEvidence(duplicate, _signEvidence(duplicate, LAB_KEY));
    }

    function test_RevertTestEvidenceWhenExpiredOrReplayed() public {
        PourLedgerRegistry.TestEvidence memory expired =
            _evidence(lotId, SAMPLE_HASH, RESULTS_HASH, lab, 0, block.timestamp - 1);
        vm.expectRevert(
            abi.encodeWithSelector(PourLedgerRegistry.SignatureExpired.selector, expired.deadline)
        );
        registry.attachTestEvidence(expired, _signEvidence(expired, LAB_KEY));

        PourLedgerRegistry.TestEvidence memory valid =
            _evidence(lotId, SAMPLE_HASH, RESULTS_HASH, lab, 0, block.timestamp + 1 hours);
        bytes memory signature = _signEvidence(valid, LAB_KEY);
        registry.attachTestEvidence(valid, signature);

        PourLedgerRegistry.TestEvidence memory secondSampleSameNonce = _evidence(
            lotId, keccak256("sample-02"), RESULTS_HASH, lab, 0, block.timestamp + 1 hours
        );
        vm.expectRevert(abi.encodeWithSelector(PourLedgerRegistry.InvalidNonce.selector, lab, 1, 0));
        registry.attachTestEvidence(
            secondSampleSameNonce, _signEvidence(secondSampleSameNonce, LAB_KEY)
        );
    }

    function testFuzz_AssignmentCannotExceedPartialAcceptance(
        uint128 partialQuantity,
        uint128 extra
    ) public {
        partialQuantity = uint128(bound(partialQuantity, 1, 99));
        extra = uint128(bound(extra, 1, type(uint128).max));
        _accept(lotId, partialQuantity, PourLedgerRegistry.LotStatus.PARTIALLY_ACCEPTED);

        PourLedgerRegistry.LotAssignment memory assignment =
            _assignment(lotId, elementId, extra, engineer, 0, block.timestamp + 1 hours);
        if (extra > partialQuantity) {
            vm.expectRevert(
                abi.encodeWithSelector(
                    PourLedgerRegistry.QuantityExceeded.selector, partialQuantity, extra
                )
            );
            registry.assignLotToElement(assignment, _signAssignment(assignment, ENGINEER_KEY));
        } else {
            registry.assignLotToElement(assignment, _signAssignment(assignment, ENGINEER_KEY));
        }
    }

    function test_SupplierDeclarationDoesNotGrantProjectAcceptance() public {
        bytes32 supplierLotHash = keccak256("supplier declared material");
        vm.prank(outsider);
        uint256 supplierLot = registry.registerMaterialLot(
            projectId,
            supplierLotHash,
            outsider,
            PourLedgerRegistry.MaterialType.REBAR,
            100,
            UNIT_KG
        );
        (
            ,,
            address declaredSupplier,,,
            uint128 accepted,
            uint128 assigned,,
            PourLedgerRegistry.LotStatus status
        ) = registry.materialLots(supplierLot);
        assertEq(declaredSupplier, outsider);
        assertEq(accepted, 0);
        assertEq(assigned, 0);
        assertEq(uint8(status), uint8(PourLedgerRegistry.LotStatus.REGISTERED));

        PourLedgerRegistry.LotAcceptance memory selfApproval = _acceptance(
            supplierLot,
            100,
            PourLedgerRegistry.LotStatus.ACCEPTED,
            CONDITION_HASH,
            outsider,
            0,
            block.timestamp
        );
        bytes memory signature = _signAcceptance(selfApproval, OUTSIDER_KEY);
        vm.expectRevert(abi.encodeWithSelector(PourLedgerRegistry.Unauthorized.selector, outsider));
        registry.acceptLot(selfApproval, signature);

        PourLedgerRegistry.LotAssignment memory beforeApproval =
            _assignment(supplierLot, elementId, 1, engineer, 0, block.timestamp);
        signature = _signAssignment(beforeApproval, ENGINEER_KEY);
        vm.expectRevert(
            abi.encodeWithSelector(
                PourLedgerRegistry.InvalidLotStatus.selector,
                PourLedgerRegistry.LotStatus.REGISTERED
            )
        );
        registry.assignLotToElement(beforeApproval, signature);
        assertEq(registry.nonces(outsider), 0);
    }

    function test_MalformedSignatureCannotConsumeNonceOrChangeLot() public {
        PourLedgerRegistry.LotAcceptance memory acceptance = _acceptance(
            lotId,
            100,
            PourLedgerRegistry.LotStatus.ACCEPTED,
            CONDITION_HASH,
            inspector,
            0,
            block.timestamp
        );
        vm.expectRevert(abi.encodeWithSelector(ECDSA.ECDSAInvalidSignatureLength.selector, 1));
        registry.acceptLot(acceptance, hex"01");
        assertEq(registry.nonces(inspector), 0);
        (,,,,, uint128 accepted,,, PourLedgerRegistry.LotStatus status) =
            registry.materialLots(lotId);
        assertEq(accepted, 0);
        assertEq(uint8(status), uint8(PourLedgerRegistry.LotStatus.REGISTERED));
        registry.acceptLot(acceptance, _signAcceptance(acceptance, INSPECTOR_KEY));
        assertEq(registry.nonces(inspector), 1);
    }

    function test_ModifiedEvidenceDigestCannotConsumeNonce() public {
        PourLedgerRegistry.LotAcceptance memory acceptance = _acceptance(
            lotId,
            100,
            PourLedgerRegistry.LotStatus.ACCEPTED,
            CONDITION_HASH,
            inspector,
            0,
            block.timestamp
        );
        bytes memory signature = _signAcceptance(acceptance, INSPECTOR_KEY);
        acceptance.conditionHash = keccak256("updated after signing");
        vm.expectPartialRevert(PourLedgerRegistry.SignerMismatch.selector);
        registry.acceptLot(acceptance, signature);
        assertEq(registry.nonces(inspector), 0);
    }

    function test_SameSignerNonceIsSharedAcrossActions() public {
        registry.setProjectRole(projectId, inspector, PourLedgerRegistry.Role.LAB, true);
        PourLedgerRegistry.TestEvidence memory evidence =
            _evidence(lotId, SAMPLE_HASH, RESULTS_HASH, inspector, 0, block.timestamp + 1 hours);
        bytes memory signature = _signEvidence(evidence, INSPECTOR_KEY);
        _accept(lotId, 100, PourLedgerRegistry.LotStatus.ACCEPTED);
        vm.expectRevert(
            abi.encodeWithSelector(PourLedgerRegistry.InvalidNonce.selector, inspector, 1, 0)
        );
        registry.attachTestEvidence(evidence, signature);
        assertEq(registry.evidenceRecordCount(), 0);
    }

    function _expectInvalidDecision(PourLedgerRegistry.LotStatus decision, uint128 quantity)
        internal
    {
        PourLedgerRegistry.LotAcceptance memory acceptance = _acceptance(
            lotId, quantity, decision, CONDITION_HASH, inspector, 0, block.timestamp + 1 hours
        );
        vm.expectRevert(
            abi.encodeWithSelector(
                PourLedgerRegistry.InvalidDecisionQuantity.selector, decision, quantity
            )
        );
        registry.acceptLot(acceptance, _signAcceptance(acceptance, INSPECTOR_KEY));
    }

    function _accept(uint256 targetLotId, uint128 quantity, PourLedgerRegistry.LotStatus decision)
        internal
    {
        PourLedgerRegistry.LotAcceptance memory acceptance = _acceptance(
            targetLotId,
            quantity,
            decision,
            CONDITION_HASH,
            inspector,
            registry.nonces(inspector),
            block.timestamp + 1 hours
        );
        registry.acceptLot(acceptance, _signAcceptance(acceptance, INSPECTOR_KEY));
    }

    function _acceptance(
        uint256 targetLotId,
        uint128 quantity,
        PourLedgerRegistry.LotStatus decision,
        bytes32 conditionHash,
        address claimedInspector,
        uint256 nonce,
        uint256 deadline
    ) internal pure returns (PourLedgerRegistry.LotAcceptance memory) {
        return PourLedgerRegistry.LotAcceptance({
            lotId: targetLotId,
            acceptedQuantity: quantity,
            decision: decision,
            conditionHash: conditionHash,
            inspector: claimedInspector,
            nonce: nonce,
            deadline: deadline
        });
    }

    function _assignment(
        uint256 targetLotId,
        uint256 targetElementId,
        uint128 quantity,
        address claimedEngineer,
        uint256 nonce,
        uint256 deadline
    ) internal pure returns (PourLedgerRegistry.LotAssignment memory) {
        return PourLedgerRegistry.LotAssignment({
            lotId: targetLotId,
            elementId: targetElementId,
            usedQuantity: quantity,
            evidenceHash: EVIDENCE_HASH,
            engineer: claimedEngineer,
            nonce: nonce,
            deadline: deadline
        });
    }

    function _evidence(
        uint256 targetLotId,
        bytes32 sampleHash,
        bytes32 resultsHash,
        address claimedLab,
        uint256 nonce,
        uint256 deadline
    ) internal pure returns (PourLedgerRegistry.TestEvidence memory) {
        return PourLedgerRegistry.TestEvidence({
            lotId: targetLotId,
            sampleHash: sampleHash,
            resultsHash: resultsHash,
            lab: claimedLab,
            nonce: nonce,
            deadline: deadline
        });
    }

    function _signAcceptance(PourLedgerRegistry.LotAcceptance memory acceptance, uint256 key)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                acceptanceTypeHash,
                acceptance.lotId,
                acceptance.acceptedQuantity,
                uint8(acceptance.decision),
                acceptance.conditionHash,
                acceptance.inspector,
                acceptance.nonce,
                acceptance.deadline
            )
        );
        return
            _signDigest(keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash)), key);
    }

    function _signAcceptanceForChain(
        PourLedgerRegistry.LotAcceptance memory acceptance,
        uint256 key,
        uint256 chainId
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                acceptanceTypeHash,
                acceptance.lotId,
                acceptance.acceptedQuantity,
                uint8(acceptance.decision),
                acceptance.conditionHash,
                acceptance.inspector,
                acceptance.nonce,
                acceptance.deadline
            )
        );
        bytes32 domainTypeHash = keccak256(
            "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
        );
        bytes32 wrongDomain = keccak256(
            abi.encode(
                domainTypeHash,
                keccak256("PourLedgerRegistry"),
                keccak256("1"),
                chainId,
                address(registry)
            )
        );
        return _signDigest(keccak256(abi.encodePacked("\x19\x01", wrongDomain, structHash)), key);
    }

    function _signAssignment(PourLedgerRegistry.LotAssignment memory assignment, uint256 key)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                assignmentTypeHash,
                assignment.lotId,
                assignment.elementId,
                assignment.usedQuantity,
                assignment.evidenceHash,
                assignment.engineer,
                assignment.nonce,
                assignment.deadline
            )
        );
        return
            _signDigest(keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash)), key);
    }

    function _signEvidence(PourLedgerRegistry.TestEvidence memory evidence, uint256 key)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                evidenceTypeHash,
                evidence.lotId,
                evidence.sampleHash,
                evidence.resultsHash,
                evidence.lab,
                evidence.nonce,
                evidence.deadline
            )
        );
        return
            _signDigest(keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash)), key);
    }

    function _signDigest(bytes32 digest, uint256 key) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }
}
