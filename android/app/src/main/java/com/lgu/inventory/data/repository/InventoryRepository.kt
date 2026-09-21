package com.lgu.inventory.data.repository

import com.google.firebase.Timestamp
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.lgu.inventory.data.model.*
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

/**
 * 🏛️ Core Repository handling reliable, transaction-oriented updates and persistent streams for the LGU System
 */
class InventoryRepository(private val db: FirebaseFirestore = FirebaseFirestore.getInstance()) {

    /**
     * Streams all inventory items with real-time updates
     */
    fun getInventoryItemsFlow(
        classification: ItemClassification? = null,
        departmentId: String? = null
    ): Flow<List<InventoryItem>> = callbackFlow {
        var query: Query = db.collection("inventory_items")
            .orderBy("article", Query.Direction.ASCENDING)

        if (classification != null) {
            query = query.whereEqualTo("classification", classification.name)
        }
        if (departmentId != null) {
            query = query.whereEqualTo("departmentId", departmentId)
        }

        val listenerRegistration = query.addSnapshotListener { snapshot, error ->
            if (error != null) {
                close(error)
                return@addSnapshotListener
            }
            if (snapshot != null) {
                val items = snapshot.toObjects(InventoryItem::class.java)
                trySend(items)
            }
        }
        awaitClose { listenerRegistration.remove() }
    }

    /**
     * Fetch all registered LGU Departments
     */
    fun getDepartmentsFlow(): Flow<List<Department>> = callbackFlow {
        val query = db.collection("departments").orderBy("name", Query.Direction.ASCENDING)
        val listenerRegistration = query.addSnapshotListener { snapshot, error ->
            if (error != null) {
                close(error)
                return@addSnapshotListener
            }
            if (snapshot != null) {
                val depts = snapshot.toObjects(Department::class.java)
                trySend(depts)
            }
        }
        awaitClose { listenerRegistration.remove() }
    }

    /**
     * Add a target LGU Department
     */
    suspend fun createDepartment(department: Department): String {
        val docRef = db.collection("departments").document()
        val finalDept = department.copy(deptId = docRef.id)
        docRef.set(finalDept).await()
        return docRef.id
    }

    /**
     * 📊 Get stock card transactions for an individual physical item
     */
    fun getStockCardTransactionsFlow(itemId: String): Flow<List<StockCardTransaction>> = callbackFlow {
        val query = db.collection("stock_cards")
            .document(itemId)
            .collection("transactions")
            .orderBy("date", Query.Direction.DESCENDING)

        val listenerRegistration = query.addSnapshotListener { snapshot, error ->
            if (error != null) {
                close(error)
                return@addSnapshotListener
            }
            if (snapshot != null) {
                val txs = snapshot.toObjects(StockCardTransaction::class.java)
                trySend(txs)
            }
        }
        awaitClose { listenerRegistration.remove() }
    }

    /**
     * Streams created forms
     */
    fun getFormsFlow(): Flow<List<LguForm>> = callbackFlow {
        val query = db.collection("forms").orderBy("dateCreated", Query.Direction.DESCENDING)
        val listenerRegistration = query.addSnapshotListener { snapshot, error ->
            if (error != null) {
                close(error)
                return@addSnapshotListener
            }
            if (snapshot != null) {
                val forms = snapshot.toObjects(LguForm::class.java)
                trySend(forms)
            }
        }
        awaitClose { listenerRegistration.remove() }
    }

    /**
     * ⚙️ WORKFLOW LOGIC: Generate Slip/Form and Atomically Process stock adjustments (IN/OUT)
     * Utilizes a highly robust atomic FireStore Transaction to guarantee complete state consistency.
     */
    suspend fun processFormTransaction(form: LguForm): Result<String> {
        val itemRef = db.collection("inventory_items").document(form.itemId)
        val formRef = db.collection("forms").document()
        val stockCardRef = db.collection("stock_cards")
            .document(form.itemId)
            .collection("transactions")
            .document()

        return try {
            db.runTransaction { transaction ->
                val snapshot = transaction.get(itemRef)
                if (!snapshot.exists()) {
                    throw IllegalStateException("LGU Inventory item does not exist")
                }

                val item = snapshot.toObject(InventoryItem::class.java)!!
                
                // Formulate logic based on Form types
                val isOutTransaction = form.type == LguFormType.ICS || 
                                       form.type == LguFormType.ITR || 
                                       form.type == LguFormType.SUPPLIES_REGISTRY

                val calculatedDifference = form.quantity

                if (isOutTransaction) {
                    if (item.qtyPhysicalCount < calculatedDifference) {
                        throw IllegalArgumentException("Insufficient stock! Available: ${item.qtyPhysicalCount}, Requested: $calculatedDifference")
                    }
                    val updatedQty = item.qtyPhysicalCount - calculatedDifference
                    // Auto-update status based on issuance
                    val updatedStatus = if (updatedQty == 0) ItemStatus.ISSUED else ItemStatus.APPROVED
                    
                    transaction.update(
                        itemRef, 
                        mapOf(
                            "qtyPhysicalCount" to updatedQty,
                            "status" to updatedStatus.name,
                            "departmentId" to form.departmentId
                        )
                    )
                } else {
                    // Replenishment (IN transition)
                    val updatedQty = item.qtyPhysicalCount + calculatedDifference
                    transaction.update(
                        itemRef,
                        mapOf(
                            "qtyPhysicalCount" to updatedQty,
                            "status" to ItemStatus.AVAILABLE.name
                        )
                    )
                }

                // Compile final Form reference
                val finalizedForm = form.copy(formId = formRef.id, status = "APPROVED")
                transaction.set(formRef, finalizedForm)

                // Compile stock card update
                val stockTx = StockCardTransaction(
                    transactionId = stockCardRef.id,
                    type = if (isOutTransaction) "OUT" else "IN",
                    quantity = form.quantity,
                    date = Timestamp.now(),
                    referenceFormId = formRef.id
                )
                transaction.set(stockCardRef, stockTx)

                formRef.id
            }.addOnSuccessListener {
                // Return success
            }.await()
            Result.success(formRef.id)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * ✅ Submits User Acceptance digital confirmation record
     */
    suspend fun submitUserAcceptance(acceptance: UserAcceptance): String {
        val dRef = db.collection("acceptance").document()
        val itemRef = db.collection("inventory_items").document(acceptance.itemId)
        val formRef = db.collection("forms").document(acceptance.formId)

        db.runBatch { batch ->
            val finalAcceptance = acceptance.copy(acceptanceId = dRef.id)
            batch.set(dRef, finalAcceptance)
            // Progress item condition indicator
            batch.update(itemRef, "status", ItemStatus.ISSUED.name)
            batch.update(formRef, "status", "ACCEPTED")
        }.await()

        return dRef.id
    }
}
