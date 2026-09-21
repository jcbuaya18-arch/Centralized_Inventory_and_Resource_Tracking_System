package com.lgu.inventory.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lgu.inventory.data.model.InventoryItem
import com.lgu.inventory.data.model.ItemClassification
import com.lgu.inventory.data.model.ItemStatus
import com.lgu.inventory.ui.viewmodel.InventoryViewModel
import java.text.NumberFormat
import java.util.Locale

/**
 * 🎨 Jetpack Compose UI: Inventory List Screen (Updated with classifications & states)
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InventoryListScreen(
    viewModel: InventoryViewModel,
    onItemClick: (InventoryItem) -> Unit,
    modifier: Modifier = Modifier
) {
    val items by viewModel.inventoryItems.collectAsState()
    val departments by viewModel.LguDepartments.collectAsState()
    val selectedClass by viewModel.selectedClassification.collectAsState()
    val selectedDeptId by viewModel.selectedDepartmentFilter.collectAsState()

    var searchQuery by remember { mutableStateOf("") }
    val formattedPrice = remember { NumberFormat.getCurrencyInstance(Locale("en", "PH")) }

    // Client-side quick search filtering
    val filteredItems = items.filter {
        it.article.contains(searchQuery, ignoreCase = true) || 
        it.propertyNumber.contains(searchQuery, ignoreCase = true)
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFFFAFAFA))
            .padding(16.dp)
    ) {
        // Core Header Label
        Text(
            text = "LGU Centralized Inventory",
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold,
            color = Color(0xFF1E293B),
            modifier = Modifier.padding(bottom = 8.dp)
        )

        // Custom Search Outlined Text Field
        OutlinedTextField(
            value = searchQuery,
            onValueChange = { searchQuery = it },
            placeholder = { Text("Search by article / property number...") },
            leadingIcon = { Icon(Icons.Default.Search, contentDescription = "Search Icon") },
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 12.dp),
            shape = RoundedCornerShape(12.dp),
            colors = TextFieldDefaults.outlinedTextFieldColors(
                focusedBorderColor = MaterialTheme.colorScheme.primary,
                unfocusedBorderColor = Color(0xFFE2E8F0)
            )
        )

        // Filter Controls section
        Text(
            text = "Filter Classifications",
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            color = Color(0xFF64748B),
            modifier = Modifier.padding(bottom = 4.dp)
        )

        // Horizontal scrolling for classifications
        LazyRow(
            modifier = Modifier.padding(bottom = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            item {
                FilterChip(
                    selected = selectedClass == null,
                    onClick = { viewModel.setClassificationFilter(null) },
                    label = { Text("All Classes") }
                )
            }
            items(ItemClassification.values()) { classification ->
                FilterChip(
                    selected = selectedClass == classification,
                    onClick = { viewModel.setClassificationFilter(classification) },
                    label = { Text(classification.name.replace("_", " ")) }
                )
            }
        }

        // Horizontal scrolling for departments
        Text(
            text = "Filter by Department",
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            color = Color(0xFF64748B),
            modifier = Modifier.padding(bottom = 4.dp)
        )

        LazyRow(
            modifier = Modifier.padding(bottom = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            item {
                FilterChip(
                    selected = selectedDeptId == null,
                    onClick = { viewModel.setDepartmentFilter(null) },
                    label = { Text("All Departments") }
                )
            }
            items(departments) { dept ->
                FilterChip(
                    selected = selectedDeptId == dept.deptId,
                    onClick = { viewModel.setDepartmentFilter(dept.deptId) },
                    label = { Text(dept.name) }
                )
            }
        }

        // List Container
        if (filteredItems.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "No matching inventory records found",
                    fontSize = 14.sp,
                    color = Color(0xFF94A3B8)
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                items(filteredItems) { item ->
                    InventoryItemCard(
                        item = item,
                        formattedValue = formattedPrice.format(item.unitValue),
                        onClick = { onItemClick(item) }
                    )
                }
            }
        }
    }
}

@Composable
fun InventoryItemCard(
    item: InventoryItem,
    formattedValue: String,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() },
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Property Code indicator
                Text(
                    text = item.propertyNumber,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF64748B),
                    letterSpacing = 0.5.sp
                )

                // Classification Badge
                ClassificationBadge(item.classification)
            }

            Spacer(modifier = Modifier.height(4.dp))

            // Article title
            Text(
                text = item.article,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF1E293B)
            )

            // Category/Local Description
            Text(
                text = item.description,
                fontSize = 13.sp,
                color = Color(0xFF64748B),
                maxLines = 1
            )

            Spacer(modifier = Modifier.height(10.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Quantity physical counter
                Column {
                    Text(
                        text = "PHYSICAL STOCK",
                        fontSize = 9.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Color(0xFF94A3B8)
                    )
                    Text(
                        text = "${item.qtyPhysicalCount} ${item.unitOfMeasure}",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = if (item.qtyPhysicalCount > 0) Color(0xFF22C55E) else Color(0xFFEF4444)
                    )
                }

                // Financial value
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        text = "ESTIMATED VALUE",
                        fontSize = 9.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Color(0xFF94A3B8)
                    )
                    Text(
                        text = formattedValue,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF3B82F6)
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            Divider(color = Color(0xFFF1F5F9))

            Spacer(modifier = Modifier.height(8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Condition Label
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "Condition: ",
                        fontSize = 12.sp,
                        color = Color(0xFF64748B)
                    )
                    Text(
                        text = item.condition.name,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = when (item.condition) {
                            com.lgu.inventory.data.model.ItemCondition.New -> Color(0xFF10B981)
                            com.lgu.inventory.data.model.ItemCondition.Used -> Color(0xFFF59E0B)
                            com.lgu.inventory.data.model.ItemCondition.Damaged -> Color(0xFFEF4444)
                        }
                    )
                }

                // Workflow Status Badge
                StatusLabel(item.status)
            }
        }
    }
}

@Composable
fun ClassificationBadge(classification: ItemClassification) {
    val (labelColor, bgColor) = when (classification) {
        ItemClassification.EXPENDABLE -> Pair(Color(0xFF3B82F6), Color(0xFFEFF6FF))
        ItemClassification.SEMI_EXPENDABLE -> Pair(Color(0xFFD97706), Color(0xFFFEF3C7))
        ItemClassification.NON_EXPENDABLE -> Pair(Color(0xFF8B5CF6), Color(0xFFF3E8FF))
    }
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(bgColor)
            .padding(horizontal = 8.dp, vertical = 4.dp)
    ) {
        Text(
            text = classification.name.replace("_", " "),
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            color = labelColor
        )
    }
}

@Composable
fun StatusLabel(status: ItemStatus) {
    val (color, text) = when (status) {
        ItemStatus.AVAILABLE -> Pair(Color(0xFF10B981), "Available")
        ItemStatus.REQUESTED -> Pair(Color(0xFF3B82F6), "Requested")
        ItemStatus.APPROVED -> Pair(Color(0xFF8B5CF6), "Approved")
        ItemStatus.ISSUED -> Pair(Color(0xFF64748B), "Issued")
        ItemStatus.RETURNED -> Pair(Color(0xFF06B6D4), "Returned")
        ItemStatus.DAMAGED -> Pair(Color(0xFFEF4444), "Damaged")
    }

    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(20.dp))
            .background(color.copy(alpha = 0.12f))
            .padding(horizontal = 10.dp, vertical = 4.dp)
    ) {
        Text(
            text = text,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            color = color
        )
    }
}
