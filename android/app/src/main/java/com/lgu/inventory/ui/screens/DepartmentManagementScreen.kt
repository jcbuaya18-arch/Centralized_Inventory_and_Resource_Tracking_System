package com.lgu.inventory.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Business
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lgu.inventory.data.model.Department
import com.lgu.inventory.ui.viewmodel.InventoryViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DepartmentManagementScreen(
    viewModel: InventoryViewModel,
    modifier: Modifier = Modifier
) {
    val departments by viewModel.LguDepartments.collectAsState()
    val items by viewModel.inventoryItems.collectAsState()
    val isProcessing by viewModel.isProcessing.collectAsState()
    val uiMessage by viewModel.uiStateMessage.collectAsState()

    var deptNameInput by remember { mutableStateOf("") }
    var userEmailsInput by remember { mutableStateOf("") } // Comma-separated user emails

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
                text = "LGU Offices & Departments",
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF0F172A)
            )
            Text(
                text = "Establish LGU structure, register new active offices, and associate administrative staff accountable for asset allocations.",
                fontSize = 13.sp,
                color = Color(0xFF64748B),
                modifier = Modifier.padding(top = 2.dp)
            )
        }

        // Creation Panel Card
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
            ) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Text(
                        text = "Register New LGU Department",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF1E293B)
                    )

                    // Department Name field
                    Column {
                        Text(
                            text = "DEPARTMENT NAME",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF64748B)
                        )
                        OutlinedTextField(
                            value = deptNameInput,
                            onValueChange = { deptNameInput = it },
                            placeholder = { Text("e.g. Accounting & Finance") },
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 4.dp),
                            shape = RoundedCornerShape(10.dp)
                        )
                    }

                    // Assigned Users field
                    Column {
                        Text(
                            text = "ASSIGNED OFFICERS & STAFF (Comma-separated emails)",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF64748B)
                        )
                        OutlinedTextField(
                            value = userEmailsInput,
                            onValueChange = { userEmailsInput = it },
                            placeholder = { Text("staff1@lgu.gov, staff2@lgu.gov") },
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 4.dp),
                            shape = RoundedCornerShape(10.dp)
                        )
                    }

                    // User feedback alerts
                    if (uiMessage != null) {
                        Card(
                            colors = CardDefaults.cardColors(containerColor = Color(0xFFECFDF5)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(10.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = uiMessage ?: "",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Medium,
                                    color = Color(0xFF047857),
                                    modifier = Modifier.weight(1f)
                                )
                                Text(
                                    text = "Dismiss",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF047857),
                                    modifier = Modifier.clickable { viewModel.clearMessage() }
                                )
                            }
                        }
                    }

                    // Create Button
                    Button(
                        onClick = {
                            val userList = userEmailsInput
                                .split(",")
                                .map { it.trim() }
                                .filter { it.isNotBlank() }
                            
                            viewModel.addDepartment(deptNameInput, userList)
                            deptNameInput = ""
                            userEmailsInput = ""
                        },
                        enabled = !isProcessing && deptNameInput.isNotBlank(),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 4.dp),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        if (isProcessing) {
                            CircularProgressIndicator(color = Color.White, modifier = Modifier.size(20.dp))
                        } else {
                            Text("Register Department", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }

        // Section label for current list
        item {
            Text(
                text = "Registered LGU Departments List",
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF1E293B),
                modifier = Modifier.padding(top = 10.dp)
            )
        }

        // Listings details
        if (departments.isEmpty()) {
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 32.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "No registered departments yet",
                        fontSize = 13.sp,
                        color = Color(0xFF94A3B8)
                    )
                }
            }
        } else {
            items(departments) { dept ->
                val assignedAssetCount = items.count { it.departmentId == dept.deptId }
                DepartmentRowCard(dept = dept, assetCount = assignedAssetCount)
            }
        }
    }
}

@Composable
fun DepartmentRowCard(dept: Department, assetCount: Int) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(40.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(Color(0xFFEFF6FF)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.Business,
                            contentDescription = "Dept Icon",
                            tint = Color(0xFF3B82F6)
                        )
                    }

                    Spacer(modifier = Modifier.width(12.dp))

                    Column {
                        Text(
                            text = dept.name,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF1E293B)
                        )
                        Text(
                            text = "Dept reference: ${dept.deptId.takeLast(6).uppercase()}",
                            fontSize = 10.sp,
                            color = Color(0xFF94A3B8)
                        )
                    }
                }

                // Assigned asset counter pill
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(Color(0xFFF1F5F9))
                        .padding(horizontal = 8.dp, vertical = 4.dp)
                ) {
                    Text(
                        text = "$assetCount active assets",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF475569)
                    )
                }
            }

            if (dept.assignedUsers.isNotEmpty()) {
                Spacer(modifier = Modifier.height(12.dp))
                Divider(color = Color(0xFFF1F5F9))
                Spacer(modifier = Modifier.height(10.dp))

                Row(
                    verticalAlignment = Alignment.Top,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(
                        imageVector = Icons.Default.Group,
                        contentDescription = "Users Icon",
                        tint = Color(0xFF94A3B8),
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Column {
                        Text(
                            text = "ASSIGNED OFFICERS & STAFF ACCREDITED",
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF94A3B8),
                            letterSpacing = 0.5.sp
                        )
                        Text(
                            text = dept.assignedUsers.joinToString(", "),
                            fontSize = 12.sp,
                            color = Color(0xFF475569),
                            modifier = Modifier.padding(top = 2.dp)
                        )
                    }
                }
            }
        }
    }
}
