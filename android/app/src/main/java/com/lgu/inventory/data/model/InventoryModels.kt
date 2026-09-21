package com.lgu.inventory.data.model

import com.google.firebase.Timestamp
import com.google.firebase.firestore.DocumentId
import java.io.Serializable

/**
 * 🧾 Item Classification based on LGU / Commission on Audit (COA) rules:
 * - EXPENDABLE: Supplies consumed during use
 * - SEMI_EXPENDABLE: Tangible items below threshold (e.g., Php 50,000 value limit)
 * - NON_EXPENDABLE: Heavy assets/equipment equal to or exceeding standard thresholds
 */
enum class ItemClassification {
    EXPENDABLE,
    SEMI_EXPENDABLE,
    NON_EXPENDABLE
}

/**
 * ⚙️ Inventory Transaction and Item Lifecycle States
 */
enum class ItemStatus {
    AVAILABLE,
    REQUESTED,
    APPROVED,
    ISSUED,
    RETURNED,
    DAMAGED
}

/**
 * Physical states of materials/assets
 */
enum class ItemCondition {
    New,
    Used,
    Damaged
}

/**
 * Dynamic form types required for compliant LGU audit trail
 */
enum class LguFormType {
    ICS,             // Inventory Custodian Slip (for semi-expendable assets)
    ITR,             // Inventory Transfer Report (for transferring accountability)
    STOCK_CARD,      // Individual item tracking balance card
    SUPPLIES_REGISTRY // Supplies/Property Issuance Registry
}

/**
 * 🏢 LGU Department schema
 */
data class Department(
    @DocumentId val deptId: String = "",
    val name: String = "",
    val assignedUsers: List<String> = emptyList() // List of user emails or UIDs
) : Serializable

/**
 * 📦 LGU Core Inventory Item model
 */
data class InventoryItem(
    @DocumentId val id: String = "",
    val article: String = "",
    val description: String = "",
    val propertyNumber: String = "",
    val unitOfMeasure: String = "",
    val unitValue: Double = 0.0,
    val qtyPropertyCard: Int = 0,
    val qtyPhysicalCount: Int = 0,
    val category: String = "",
    val office: String = "", // Matches text representation of target office
    val departmentId: String? = null, // Linked department
    val personAccountable: String = "",
    val remarks: String = "",
    val classification: ItemClassification = ItemClassification.EXPENDABLE,
    val status: ItemStatus = ItemStatus.AVAILABLE,
    val condition: ItemCondition = ItemCondition.New,
    val value: Double = 0.0,
    val imageUrls: List<String> = emptyList(),
    val history: List<HistoryEntry> = emptyList()
) : Serializable

data class HistoryEntry(
    val id: String = "",
    val timestamp: Timestamp = Timestamp.now(),
    val user: String = "",
    val action: String = ""
) : Serializable

/**
 * 📄 Dynamic Form Entry Model (ICS / ITR etc.)
 */
data class LguForm(
    @DocumentId val formId: String = "",
    val type: LguFormType = LguFormType.ICS,
    val itemId: String = "",
    val userId: String = "", // Receiving officer / current user UID
    val departmentId: String = "", // Linked Department
    val quantity: Int = 1,
    val dateCreated: Timestamp = Timestamp.now(),
    val status: String = "PENDING" // e.g. DRAFT, ISSUED, FINALIZED
) : Serializable

/**
 * 📊 Stock Card Transaction Entry Model
 */
data class StockCardTransaction(
    @DocumentId val transactionId: String = "",
    val type: String = "IN", // "IN" or "OUT"
    val quantity: Int = 0,
    val date: Timestamp = Timestamp.now(),
    val referenceFormId: String? = null
) : Serializable

/**
 * ✅ User Acceptance / Handover Acknowledgment Model
 */
data class UserAcceptance(
    @DocumentId val acceptanceId: String = "",
    val userId: String = "",
    val itemId: String = "",
    val formId: String = "",
    val acceptedAt: Timestamp = Timestamp.now(),
    val signature: String? = null // Base64 encoded drawing or digital marker
) : Serializable
