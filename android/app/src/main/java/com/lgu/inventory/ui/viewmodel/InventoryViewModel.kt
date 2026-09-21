package com.lgu.inventory.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.Timestamp
import com.lgu.inventory.data.model.*
import com.lgu.inventory.data.repository.InventoryRepository
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

/**
 * 🧱 InventoryViewModel integrating clean LGU logic with Jetpack Compose StateFlow
 */
class InventoryViewModel(private val repository: InventoryRepository) : ViewModel() {

    // Filter properties
    private val _selectedClassification = MutableStateFlow<ItemClassification?>(null)
    val selectedClassification: StateFlow<ItemClassification?> = _selectedClassification.asStateFlow()

    private val _selectedDepartmentFilter = MutableStateFlow<String?>(null)
    val selectedDepartmentFilter: StateFlow<String?> = _selectedDepartmentFilter.asStateFlow()

    // Stream list of items matching dynamic filters
    val inventoryItems: StateFlow<List<InventoryItem>> = combine(
        _selectedClassification,
        _selectedDepartmentFilter
    ) { classification, deptId ->
        Pair(classification, deptId)
    }.flatMapLatest { (classification, deptId) ->
        repository.getInventoryItemsFlow(classification, deptId)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    // Stream available LGU Departments
    val LguDepartments: StateFlow<List<Department>> = repository.getDepartmentsFlow()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    // Stream of Generated LguForms
    val generatedForms: StateFlow<List<LguForm>> = repository.getFormsFlow()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    // Selected item for displaying historical Stock Card detail view
    private val _selectedItemIdForStockCard = MutableStateFlow<String?>(null)
    val selectedItemIdForStockCard: StateFlow<String?> = _selectedItemIdForStockCard.asStateFlow()

    val stockCardTransactions: StateFlow<List<StockCardTransaction>> = _selectedItemIdForStockCard
        .flatMapLatest { itemId ->
            if (itemId != null) {
                repository.getStockCardTransactionsFlow(itemId)
            } else {
                flowOf(emptyList())
            }
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    // Loading & Operation statuses
    private val _uiStateMessage = MutableStateFlow<String?>(null)
    val uiStateMessage: StateFlow<String?> = _uiStateMessage.asStateFlow()

    private val _isProcessing = MutableStateFlow(false)
    val isProcessing: StateFlow<Boolean> = _isProcessing.asStateFlow()

    /**
     * Update active filters
     */
    fun setClassificationFilter(classification: ItemClassification?) {
        _selectedClassification.value = classification
    }

    fun setDepartmentFilter(deptId: String?) {
        _selectedDepartmentFilter.value = deptId
    }

    fun selectItemForStockCard(itemId: String?) {
        _selectedItemIdForStockCard.value = itemId
    }

    /**
     * Create department
     */
    fun addDepartment(name: String, assignedUsers: List<String>) {
        if (name.isBlank()) {
            _uiStateMessage.value = "Department name is required"
            return
        }
        viewModelScope.launch {
            _isProcessing.value = true
            try {
                val dept = Department(name = name, assignedUsers = assignedUsers)
                repository.createDepartment(dept)
                _uiStateMessage.value = "Department '$name' registered successfully"
            } catch (e: Exception) {
                _uiStateMessage.value = "Failed to add department: ${e.message}"
            } finally {
                _isProcessing.value = false
            }
        }
    }

    /**
     * Generate dynamic slip (ICS / ITR) and process transactional balance deductions
     */
    fun generateLguFormAndAdjustStock(
        type: LguFormType,
        itemId: String,
        userId: String,
        departmentId: String,
        quantity: Int
    ) {
        if (quantity <= 0) {
            _uiStateMessage.value = "Quantity must be greater than zero!"
            return
        }

        viewModelScope.launch {
            _isProcessing.value = true
            _uiStateMessage.value = "Processing asset issuance..."
            
            val form = LguForm(
                type = type,
                itemId = itemId,
                userId = userId,
                departmentId = departmentId,
                quantity = quantity,
                dateCreated = Timestamp.now()
            )

            val result = repository.processFormTransaction(form)
            if (result.isSuccess) {
                _uiStateMessage.value = "Success! Form generated under Ref: ${result.getOrNull()}"
            } else {
                _uiStateMessage.value = "Error: ${result.exceptionOrNull()?.message}"
            }
            _isProcessing.value = false
        }
    }

    /**
     * Submit physical item handover acknowledgement
     */
    fun submitSignOffAcceptance(userId: String, itemId: String, formId: String, signatureBase64: String?) {
        viewModelScope.launch {
            _isProcessing.value = true
            _uiStateMessage.value = "Recording official handover..."
            try {
                val signOff = UserAcceptance(
                    userId = userId,
                    itemId = itemId,
                    formId = formId,
                    acceptedAt = Timestamp.now(),
                    signature = signatureBase64
                )
                repository.submitUserAcceptance(signOff)
                _uiStateMessage.value = "Official Handover recorded successfully!"
            } catch (e: Exception) {
                _uiStateMessage.value = "Failed to record sign-off: ${e.message}"
            } finally {
                _isProcessing.value = false
            }
        }
    }

    fun clearMessage() {
        _uiStateMessage.value = null
    }
}
