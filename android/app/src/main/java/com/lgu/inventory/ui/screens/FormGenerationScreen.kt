package com.lgu.inventory.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.FileDownload
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lgu.inventory.data.model.InventoryItem
import com.lgu.inventory.data.model.LguForm
import com.lgu.inventory.data.model.LguFormType
import com.lgu.inventory.ui.viewmodel.InventoryViewModel
import java.text.SimpleDateFormat
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FormGenerationScreen(
    viewModel: InventoryViewModel,
    currentUserEid: String, // UID or Email of current user acting as Officer
    modifier: Modifier = Modifier
) {
    val items by viewModel.inventoryItems.collectAsState()
    val departments by viewModel.LguDepartments.collectAsState()
    val forms by viewModel.generatedForms.collectAsState()
    val isProcessing by viewModel.isProcessing.collectAsState()
    val statusMessage by viewModel.uiStateMessage.collectAsState()

    var selectedFormType by remember { mutableStateOf(LguFormType.ICS) }
    var selectedItem by remember { mutableStateOf<InventoryItem?>(null) }
    var selectedDept by remember { mutableStateOf<com.lgu.inventory.data.model.Department?>(null) }
    var inputQuantity by remember { mutableStateOf("1") }
    
    var itemDropdownExpanded by remember { mutableStateOf(false) }
    var deptDropdownExpanded by remember { mutableStateOf(false) }

    val sdf = remember { SimpleDateFormat("MMM dd, yyyy - hh:mm a", Locale.getDefault()) }

    // Alert Handling
    LaunchedEffect(statusMessage) {
        if (statusMessage != null) {
            // Can trigger a Snackbar or auto dismiss
        }
    }

    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFFF8FAFC))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Upper Title
        item {
            Text(
                text = "LGU Form Generator Module",
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF0F172A)
            )
            Text(
                text = "Generate and issue official Inventory Custodian Slips (ICS) or Transfer Slips in compliance with Local Government Regulations.",
                fontSize = 13.sp,
                color = Color(0xFF64748B),
                modifier = Modifier.padding(top = 2.dp)
            )
        }

        // Generator Action Card
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
            ) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    Text(
                        text = "Issue New Form Slip",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF1E293B)
                    )

                    // Form Type Selection row
                    Column {
                        Text(
                            text = "FORM SLIP TYPE",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF64748B)
                        )
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 4.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            LguFormType.values().forEach { type ->
                                val isSelected = selectedFormType == type
                                Button(
                                    onClick = { selectedFormType = type },
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = if (isSelected) MaterialTheme.colorScheme.primary else Color(0xFFE2E8F0),
                                        contentColor = if (isSelected) Color.White else Color(0xFF475569)
                                    ),
                                    shape = RoundedCornerShape(8.dp),
                                    modifier = Modifier.weight(1f),
                                    contentPadding = PaddingValues(horizontal = 4.dp, vertical = 8.dp)
                                ) {
                                    Text(
                                        text = type.name,
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }
                        }
                    }

                    // Item Selection Dropdown
                    Column {
                        Text(
                            text = "SELECT INVENTORY ASSET",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF64748B)
                        )
                        Box(modifier = Modifier.fillMaxWidth().padding(top = 4.dp)) {
                            OutlinedCard(
                                onClick = { itemDropdownExpanded = true },
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth().padding(14.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = selectedItem?.article ?: "-- Choose asset item --",
                                        color = if (selectedItem == null) Color(0xFF94A3B8) else Color(0xFF1E293B),
                                        fontSize = 14.sp
                                    )
                                    Icon(Icons.Default.ArrowDropDown, contentDescription = "Dropdown")
                                }
                            }
                            DropdownMenu(
                                expanded = itemDropdownExpanded,
                                onDismissRequest = { itemDropdownExpanded = false },
                                modifier = Modifier.fillMaxWidth(0.9f)
                            ) {
                                items.forEach { item ->
                                    DropdownMenuItem(
                                        text = { Text("[${item.propertyNumber}] - ${item.article} (Stock: ${item.qtyPhysicalCount})") },
                                        onClick = {
                                            selectedItem = item
                                            itemDropdownExpanded = false
                                        }
                                    )
                                }
                            }
                        }
                    }

                    // Department Selection Dropdown
                    Column {
                        Text(
                            text = "TARGET RECIPIENT DEPARTMENT",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF64748B)
                        )
                        Box(modifier = Modifier.fillMaxWidth().padding(top = 4.dp)) {
                            OutlinedCard(
                                onClick = { deptDropdownExpanded = true },
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth().padding(14.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = selectedDept?.name ?: "-- Choose LGU Department --",
                                        color = if (selectedDept == null) Color(0xFF94A3B8) else Color(0xFF1E293B),
                                        fontSize = 14.sp
                                    )
                                    Icon(Icons.Default.ArrowDropDown, contentDescription = "Dropdown")
                                }
                            }
                            DropdownMenu(
                                expanded = deptDropdownExpanded,
                                onDismissRequest = { deptDropdownExpanded = false },
                                modifier = Modifier.fillMaxWidth(0.9f)
                            ) {
                                departments.forEach { dept ->
                                    DropdownMenuItem(
                                        text = { Text(dept.name) },
                                        onClick = {
                                            selectedDept = dept
                                            deptDropdownExpanded = false
                                        }
                                    )
                                }
                            }
                        }
                    }

                    // Quantity Field
                    Column {
                        Text(
                            text = "TRANSACTION QUANTITY",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF64748B)
                        )
                        OutlinedTextField(
                            value = inputQuantity,
                            onValueChange = { inputQuantity = it },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 4.dp),
                            shape = RoundedCornerShape(10.dp)
                        )
                    }

                    // Processing alerts feedback
                    if (statusMessage != null) {
                        Card(
                            colors = CardDefaults.cardColors(containerColor = Color(0xFFEFF6FF)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(10.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = statusMessage ?: "",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = Color(0xFF1D4ED8),
                                    modifier = Modifier.weight(1f)
                                )
                                Text(
                                    text = "Dismiss",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF1D4ED8),
                                    modifier = Modifier.clickable { viewModel.clearMessage() }
                                )
                            }
                        }
                    }

                    // Action trigger Button
                    Button(
                        onClick = {
                            val item = selectedItem
                            val dept = selectedDept
                            if (item != null && dept != null) {
                                val qtyVal = inputQuantity.toIntOrNull() ?: 0
                                viewModel.generateLguFormAndAdjustStock(
                                    type = selectedFormType,
                                    itemId = item.id,
                                    userId = currentUserEid,
                                    departmentId = dept.deptId,
                                    quantity = qtyVal
                                )
                            }
                        },
                        enabled = !isProcessing && selectedItem != null && selectedDept != null,
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        if (isProcessing) {
                            CircularProgressIndicator(color = Color.White, modifier = Modifier.size(20.dp))
                        } else {
                            Text("Generate and Validate Form Slip", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }

        // Section header for generated listings
        item {
            Text(
                text = "Recently Issued Form Documents",
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF1E293B),
                modifier = Modifier.padding(top = 10.dp)
            )
        }

        // Issued forms history view
        if (forms.isEmpty()) {
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 24.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "No form slips issued to date",
                        fontSize = 13.sp,
                        color = Color(0xFF94A3B8)
                    )
                }
            }
        } else {
            items(forms) { issuedForm ->
                val dateString = remember(issuedForm.dateCreated) {
                    sdf.format(issuedForm.dateCreated.toDate())
                }
                
                LguFormLogCard(
                    form = issuedForm,
                    formattedDate = dateString,
                    itemName = items.find { it.id == issuedForm.itemId }?.article ?: "Unknown Item",
                    deptName = departments.find { it.deptId == issuedForm.departmentId }?.name ?: "General Office"
                )
            }
        }
    }
}

@Composable
fun LguFormLogCard(
    form: LguForm,
    formattedDate: String,
    itemName: String,
    deptName: String
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White)
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // PDF Document Icon placeholder
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .background(Color(0xFFF1F5F9), RoundedCornerShape(22.dp)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.Description,
                    contentDescription = "Form Icon",
                    tint = Color(0xFF475569)
                )
            }

            Spacer(modifier = Modifier.width(14.dp))

            Column(modifier = Modifier.weight(1f)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    // Form Classification Slips
                    Text(
                        text = "${form.type.name} Ref: ${form.formId.takeLast(7).uppercase()}",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF1E293B)
                    )
                    
                    // Approval Badge status
                    Box(
                        modifier = Modifier
                            .background(
                                color = when (form.status) {
                                    "ACCEPTED" -> Color(0xFFDCFCE7)
                                    "PENDING" -> Color(0xFFFEF3C7)
                                    else -> Color(0xFFEFF6FF)
                                },
                                shape = RoundedCornerShape(4.dp)
                            )
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = form.status,
                            fontSize = 9.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = when (form.status) {
                                "ACCEPTED" -> Color(0xFF15803D)
                                "PENDING" -> Color(0xFFB45309)
                                else -> Color(0xFF1D4ED8)
                            }
                        )
                    }
                }

                Spacer(modifier = Modifier.height(2.dp))

                // Detail entries
                Text(
                    text = "Asset: $itemName",
                    fontSize = 12.sp,
                    color = Color(0xFF475569),
                    fontWeight = FontWeight.Medium
                )
                Text(
                    text = "Issued to: $deptName (Qty: ${form.quantity})",
                    fontSize = 11.sp,
                    color = Color(0xFF64748B)
                )
                Text(
                    text = "Date: $formattedDate",
                    fontSize = 10.sp,
                    color = Color(0xFF94A3B8)
                )
            }

            Spacer(modifier = Modifier.width(10.dp))

            // PDF download shortcut visual representation
            IconButton(onClick = { /* Ready trigger for PDF export logic */ }) {
                Icon(
                    imageVector = Icons.Default.FileDownload,
                    contentDescription = "Export Form to PDF",
                    tint = Color(0xFF3B82F6)
                )
            }
        }
    }
}
