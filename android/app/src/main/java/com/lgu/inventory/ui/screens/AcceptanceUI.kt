package com.lgu.inventory.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BorderColor
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lgu.inventory.data.model.InventoryItem
import com.lgu.inventory.data.model.LguForm
import com.lgu.inventory.ui.viewmodel.InventoryViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AcceptanceScreen(
    viewModel: InventoryViewModel,
    currentUserEid: String,
    modifier: Modifier = Modifier
) {
    val items by viewModel.inventoryItems.collectAsState()
    val departments by viewModel.LguDepartments.collectAsState()
    val forms by viewModel.generatedForms.collectAsState()
    val isProcessing by viewModel.isProcessing.collectAsState()
    val statusMessage by viewModel.uiStateMessage.collectAsState()

    // Filter forms that are currently in 'APPROVED' or 'PENDING' status (awaiting recipient handover confirmation)
    val pendingHandoverForms = remember(forms) {
        forms.filter { it.status == "APPROVED" || it.status == "PENDING" }
    }

    var selectedForm by remember { mutableStateOf<LguForm?>(null) }
    val pathPoints = remember { mutableStateListOf<Offset>() }

    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFFF8FAFC))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Module Header
        item {
            Text(
                text = "Official Asset Handover Sign-off",
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF0F172A)
            )
            Text(
                text = "Recipient Officers must sign and acknowledge accountability slips upon actual receipt of LGU equipment.",
                fontSize = 13.sp,
                color = Color(0xFF64748B),
                modifier = Modifier.padding(top = 2.dp)
            )
        }

        // Dropdown/Selector for pending handovers
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "Awaiting Your Acknowledgment (${pendingHandoverForms.size})",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF1E293B),
                        modifier = Modifier.padding(bottom = 8.dp)
                    )

                    if (pendingHandoverForms.isEmpty()) {
                        Text(
                            text = "No pending asset handovers found requiring your signature.",
                            fontSize = 12.sp,
                            color = Color(0xFF94A3B8)
                        )
                    } else {
                        // Quick list to select a form
                        pendingHandoverForms.forEach { pendingForm ->
                            val linkedItem = items.find { it.id == pendingForm.itemId }
                            val linkedDept = departments.find { it.deptId == pendingForm.departmentId }
                            val isChosen = selectedForm?.formId == pendingForm.formId

                            Card(
                                onClick = { 
                                    selectedForm = pendingForm 
                                    pathPoints.clear() // Reset signature path is selected item changes
                                },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp),
                                shape = RoundedCornerShape(8.dp),
                                colors = CardDefaults.cardColors(
                                    containerColor = if (isChosen) Color(0xFFEFF6FF) else Color(0xFFF8FAFC)
                                ),
                                border = if (isChosen) {
                                    androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF3B82F6))
                                } else null
                            ) {
                                Row(
                                    modifier = Modifier.padding(12.dp).fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = linkedItem?.article ?: "Unknown Equipment",
                                            fontSize = 13.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = Color(0xFF1E293B)
                                        )
                                        Text(
                                            text = "Ref: ${pendingForm.formId.takeLast(6).uppercase()} | Target Dept: ${linkedDept?.name ?: "General"}",
                                            fontSize = 11.sp,
                                            color = Color(0xFF64748B)
                                        )
                                        Text(
                                            text = "Qty: ${pendingForm.quantity} pcs",
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = Color(0xFF3B82F6)
                                        )
                                    }

                                    Icon(
                                        imageVector = Icons.Default.CheckCircle,
                                        contentDescription = "Select Icon",
                                        tint = if (isChosen) Color(0xFF3B82F6) else Color(0xFFCBD5E1),
                                        modifier = Modifier.size(20.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        // Active Sign-off controls
        selectedForm?.let { activeForm ->
            val linkedItem = items.find { it.id == activeForm.itemId }
            val linkedDept = departments.find { it.deptId == activeForm.departmentId }

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
                            text = "Acknowledge Accountability",
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF0F172A)
                        )

                        // Handover details
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(Color(0xFFF1F5F9), RoundedCornerShape(8.dp))
                                .padding(12.dp)
                        ) {
                            Text(
                                text = "Item: ${linkedItem?.article}",
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF0F172A)
                            )
                            Text(
                                text = "Property Number: ${linkedItem?.propertyNumber}",
                                fontSize = 11.sp,
                                color = Color(0xFF475569)
                            )
                            Text(
                                text = "Quantity Transferred: ${activeForm.quantity}",
                                fontSize = 11.sp,
                                color = Color(0xFF475569)
                            )
                            Text(
                                text = "Assigned LGU Department: ${linkedDept?.name}",
                                fontSize = 11.sp,
                                color = Color(0xFF475569)
                            )
                        }

                        // Digital Signature Pad label
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    imageVector = Icons.Default.BorderColor,
                                    contentDescription = "Sign Pad",
                                    tint = Color(0xFF64748B),
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = "DRAW SIGNATURE IN BOX BELOW",
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF64748B)
                                )
                            }

                            // Clear trace control
                            TextButton(
                                onClick = { pathPoints.clear() },
                                colors = ButtonDefaults.textButtonColors(contentColor = Color(0xFFEF4444)),
                                contentPadding = PaddingValues(0.dp)
                            ) {
                                Icon(Icons.Default.Clear, contentDescription = "Clear", modifier = Modifier.size(14.dp))
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("Clear Pad", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            }
                        }

                        // Drawing Pad Panel Canvas
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(150.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(Color.White)
                                .border(1.dp, Color(0xFF94A3B8), RoundedCornerShape(10.dp))
                                .pointerInput(Unit) {
                                    detectDragGestures(
                                        onDragStart = { offset ->
                                            pathPoints.add(offset)
                                        },
                                        onDrag = { change, dragAmount ->
                                            change.consume()
                                            pathPoints.add(change.position)
                                        },
                                        onDragEnd = {
                                            pathPoints.add(Offset.Unspecified) // Split paths
                                        }
                                    )
                                }
                        ) {
                            Canvas(modifier = Modifier.fillMaxSize()) {
                                val stroke = Stroke(width = 4f, cap = StrokeCap.Round)
                                var currentPath = Path()
                                var isFirst = true

                                pathPoints.forEach { point ->
                                    if (point == Offset.Unspecified) {
                                        drawPath(currentPath, color = Color(0xFF1E293B), style = stroke)
                                        currentPath = Path()
                                        isFirst = true
                                    } else {
                                        if (isFirst) {
                                            currentPath.moveTo(point.x, point.y)
                                            isFirst = false
                                        } else {
                                            currentPath.lineTo(point.x, point.y)
                                        }
                                    }
                                }
                                drawPath(currentPath, color = Color(0xFF1E293B), style = stroke)
                            }
                        }

                        // User Feedback logs
                        statusMessage?.let { msg ->
                            Text(
                                text = msg,
                                fontSize = 12.sp,
                                color = Color(0xFF1D4ED8),
                                fontWeight = FontWeight.SemiBold
                            )
                        }

                        // Action Handlers
                        Button(
                            onClick = {
                                // Convert pathPoints to standard Base64 representation (mock/dummy coordinate list format representable on backend)
                                val base64CoordSignature = if (pathPoints.isNotEmpty()) {
                                    pathPoints.joinToString(";") { "${it.x.toInt()},${it.y.toInt()}" }
                                } else "OFFICIAL_CHECK_WITHOUT_TRACE"

                                viewModel.submitSignOffAcceptance(
                                    userId = currentUserEid,
                                    itemId = activeForm.itemId,
                                    formId = activeForm.formId,
                                    signatureBase64 = base64CoordSignature
                                )

                                selectedForm = null
                                pathPoints.clear()
                            },
                            enabled = !isProcessing,
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp)
                        ) {
                            Text("Confirm Sign-off and Acknowledge Receipt", fontWeight = FontWeight.ExtraBold)
                        }
                    }
                }
            }
        }
    }
}
