package com.lgu.inventory.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.TrendingDown
import androidx.compose.material.icons.filled.TrendingUp
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
import com.lgu.inventory.data.model.StockCardTransaction
import com.lgu.inventory.ui.viewmodel.InventoryViewModel
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * 📊 Jetpack Compose UI: Stock Card Ledger View per Item
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StockCardViewScreen(
    viewModel: InventoryViewModel,
    selectedItem: InventoryItem,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    // Register the current dynamic selected item inside the viewmodel
    LaunchedEffect(selectedItem.id) {
        viewModel.selectItemForStockCard(selectedItem.id)
    }

    val transactions by viewModel.stockCardTransactions.collectAsState()
    val sdf = remember { SimpleDateFormat("MMM dd, yyyy - hh:mm a", Locale.getDefault()) }

    // Calculate sequential running balances from bottom to top (oldest to newest)
    val runningBalances = remember(transactions) {
        var balance = selectedItem.qtyPhysicalCount
        val sortedAscending = transactions.sortedBy { it.date }
        val balanceMap = mutableMapOf<String, Int>()
        
        // Walk backwards starting from current balance to trace historic transactions
        for (i in sortedAscending.indices.reversed()) {
            val tx = sortedAscending[i]
            balanceMap[tx.transactionId] = balance
            if (tx.type == "IN") {
                balance -= tx.quantity
            } else {
                balance += tx.quantity
            }
        }
        balanceMap
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("LGU Stock Card Ledger") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back Button")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.White,
                    titleContentColor = Color(0xFF1E293B)
                )
            )
        },
        modifier = modifier.fillMaxSize()
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFFF8FAFC))
                .padding(innerPadding)
                .padding(16.dp)
        ) {
            // Summary Header Card for selected item details
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 16.dp),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
            ) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Text(
                        text = selectedItem.propertyNumber,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF3B82F6)
                    )
                    Text(
                        text = selectedItem.article,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF0F172A)
                    )
                    Text(
                        text = "Holder: ${selectedItem.personAccountable}",
                        fontSize = 13.sp,
                        color = Color(0xFF64748B)
                    )

                    Spacer(modifier = Modifier.height(14.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column {
                            Text(
                                text = "RUNNING BALANCE",
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF94A3B8)
                            )
                            Text(
                                text = "${selectedItem.qtyPhysicalCount} units",
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Black,
                                color = Color(0xFF10B981)
                            )
                        }

                        Column(horizontalAlignment = Alignment.End) {
                            Text(
                                text = "CLASSIFICATION",
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF94A3B8)
                            )
                            ClassificationBadge(selectedItem.classification)
                        }
                    }
                }
            }

            Text(
                text = "Transaction History Ledger",
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF475569),
                modifier = Modifier.padding(bottom = 10.dp)
            )

            // Dynamic list of transactions
            if (transactions.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "No Stock Card logs recorded for this item yet",
                        fontSize = 13.sp,
                        color = Color(0xFF64748B)
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxWidth().weight(1f),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    itemsIndexed(transactions) { index, tx ->
                        val balanceAfterTx = runningBalances[tx.transactionId] ?: 0
                        val dateString = remember(tx.date) {
                            sdf.format(tx.date.toDate())
                        }
                        StockTransactionRow(tx = tx, dateText = dateString, runningBalance = balanceAfterTx)
                    }
                }
            }
        }
    }
}

@Composable
fun StockTransactionRow(
    tx: StockCardTransaction,
    dateText: String,
    runningBalance: Int
) {
    val isIncoming = tx.type == "IN"
    
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                // Circle visual indicator showing direction
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(RoundedCornerShape(18.dp))
                        .background(
                            if (isIncoming) Color(0xFFDCFCE7) else Color(0xFFFEE2E2)
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = if (isIncoming) Icons.Default.TrendingUp else Icons.Default.TrendingDown,
                        contentDescription = "Tx Direction",
                        tint = if (isIncoming) Color(0xFF15803D) else Color(0xFFB91C1C)
                    )
                }

                Spacer(modifier = Modifier.width(12.dp))

                Column {
                    Text(
                        text = if (isIncoming) "Stock Replenishment (IN)" else "Asset Issuance (OUT)",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF1E293B)
                    )
                    Text(
                        text = dateText,
                        fontSize = 11.sp,
                        color = Color(0xFF94A3B8)
                    )
                    if (tx.referenceFormId != null) {
                        Text(
                            text = "Reference Form: ${tx.referenceFormId}",
                            fontSize = 11.sp,
                            color = Color(0xFF3B82F6),
                            fontWeight = FontWeight.Medium
                        )
                    }
                }
            }

            // Delta qty and Running Balance details
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    text = "${if (isIncoming) "+" else "-"}${tx.quantity} units",
                    fontSize = 15.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = if (isIncoming) Color(0xFF10B981) else Color(0xFFEF4444)
                )

                Text(
                    text = "Bal: $runningBalance",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Color(0xFF64748B)
                )
            }
        }
    }
}
