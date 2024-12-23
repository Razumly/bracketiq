//package com.razumly.mvp.eventCreate.presentation.steps
//
//import androidx.compose.foundation.background
//import androidx.compose.foundation.clickable
//import androidx.compose.foundation.layout.Arrangement
//import androidx.compose.foundation.layout.Box
//import androidx.compose.foundation.layout.Column
//import androidx.compose.foundation.layout.Row
//import androidx.compose.foundation.layout.fillMaxSize
//import androidx.compose.foundation.layout.fillMaxWidth
//import androidx.compose.foundation.layout.padding
//import androidx.compose.foundation.lazy.LazyColumn
//import androidx.compose.material.Icon
//import androidx.compose.material.IconButton
//import androidx.compose.material.ListItem
//import androidx.compose.material.MaterialTheme
//import androidx.compose.material.OutlinedTextField
//import androidx.compose.material.TextButton
//import androidx.compose.material.icons.Icons
//import androidx.compose.material.icons.filled.Search
//import androidx.compose.runtime.Composable
//import androidx.compose.runtime.DisposableEffect
//import androidx.compose.runtime.LaunchedEffect
//import androidx.compose.runtime.getValue
//import androidx.compose.runtime.mutableStateOf
//import androidx.compose.runtime.remember
//import androidx.compose.runtime.rememberCoroutineScope
//import androidx.compose.runtime.setValue
//import androidx.compose.ui.Modifier
//import androidx.compose.ui.unit.dp
//import androidx.compose.ui.window.Dialog
//import androidx.compose.ui.window.DialogProperties
//import com.razumly.mvp.eventCreate.presentation.CreateEventComponent
//import dev.icerock.moko.geo.LatLng
//import dev.icerock.moko.permissions.Permission
//import kotlinx.coroutines.flow.firstOrNull
//import kotlinx.coroutines.launch
//
//@Composable
//fun MapSelectionDialog(
//    component: CreateEventComponent,
//    onDismiss: () -> Unit,
//    onLocationSelected: (name: String, lat: Double, long: Double) -> Unit
//) {
//    var searchQuery by remember { mutableStateOf("") }
//    var predictions by remember { mutableStateOf<List<AutocompletePrediction>>(emptyList()) }
//    var currentLocation by remember { mutableStateOf<LatLng?>(null) }
//    val cameraPositionState = rememberCameraPositionState()
//    val context = LocalContext.current
//    val placesClient = remember { Places.createClient(context) }
//    val scope = rememberCoroutineScope()
//
//    LaunchedEffect(Unit) {
//        try {
//            permissionsController.providePermission(Permission.LOCATION)
//            locationTracker.startTracking()
//
//            // Get initial location
//            locationTracker.getLocationsFlow()
//                .firstOrNull()
//                ?.let { location ->
//                    val latLng = LatLng(location.latitude, location.longitude)
//                    currentLocation = latLng
//                    cameraPositionState.animate(
//                        update = CameraUpdateFactory.newLatLngZoom(latLng, 15f),
//                        durationMs = 1000
//                    )
//                }
//        } catch (e: Exception) {
//            // Handle permission denied
//        }
//    }
//
//    DisposableEffect(Unit) {
//        onDispose {
//            locationTracker.stopTracking()
//        }
//    }
//
//    Dialog(
//        onDismissRequest = onDismiss,
//        properties = DialogProperties(usePlatformDefaultWidth = false)
//    ) {
//        Column(
//            modifier = Modifier
//                .fillMaxSize()
//                .background(MaterialTheme.colorScheme.surface)
//        ) {
//            OutlinedTextField(
//                value = searchQuery,
//                onValueChange = { query ->
//                    searchQuery = query
//                    val request = FindAutocompletePredictionsRequest.builder()
//                        .setQuery(query)
//                        .build()
//
//                    placesClient.findAutocompletePredictions(request)
//                        .addOnSuccessListener { response ->
//                            predictions = response.autocompletePredictions
//                        }
//                },
//                placeholder = { Text("Search location") },
//                modifier = Modifier
//                    .fillMaxWidth()
//                    .padding(16.dp),
//                trailingIcon = {
//                    IconButton(onClick = {}) {
//                        Icon(Icons.Default.Search, "Search")
//                    }
//                }
//            )
//
//            if (predictions.isNotEmpty() && searchQuery.isNotEmpty()) {
//                LazyColumn(
//                    modifier = Modifier
//                        .weight(0.4f)
//                        .fillMaxWidth()
//                ) {
//                    items(predictions.size, { predictions[it].placeId }, { predictions[it] }) { i ->
//                        ListItem(
//                            headlineContent = {
//                                Text(predictions[i].getPrimaryText(null).toString())
//                            },
//                            supportingContent = {
//                                Text(predictions[i].getSecondaryText(null).toString())
//                            },
//                            modifier = Modifier.clickable {
//                                val placeFields = listOf(
//                                    Place.Field.LOCATION,
//                                    Place.Field.DISPLAY_NAME,
//                                    Place.Field.FORMATTED_ADDRESS
//                                )
//                                val request = FetchPlaceRequest.builder(
//                                    predictions[i].placeId,
//                                    placeFields
//                                ).build()
//
//                                placesClient.fetchPlace(request)
//                                    .addOnSuccessListener { response ->
//                                        response.place.location?.let { latLng ->
//                                            scope.launch {
//                                                cameraPositionState.animate(
//                                                    update = CameraUpdateFactory.newLatLngZoom(
//                                                        latLng,
//                                                        15f
//                                                    ),
//                                                    durationMs = 1000
//                                                )
//                                            }
//                                            onLocationSelected(
//                                                response.place.adrFormatAddress
//                                                    ?: response.place.displayName ?: "",
//                                                latLng.latitude,
//                                                latLng.longitude
//                                            )
//                                        }
//                                    }
//                                searchQuery = ""
//                                predictions = emptyList()
//                            }
//                        )
//
//                        // Modify location tracking effect
//                        LaunchedEffect(Unit) {
//                            try {
//                                permissionsController.providePermission(Permission.LOCATION)
//                                locationTracker.startTracking()
//
//                                locationTracker.getLocationsFlow()
//                                    .firstOrNull()
//                                    ?.let { location ->
//                                        val latLng = LatLng(location.latitude, location.longitude)
//                                        currentLocation = latLng
//                                        scope.launch {
//                                            cameraPositionState.animate(
//                                                update = CameraUpdateFactory.newLatLngZoom(
//                                                    latLng,
//                                                    15f
//                                                ),
//                                                durationMs = 1000
//                                            )
//                                        }
//                                    }
//                            } catch (e: Exception) {
//                                // Handle permission denied
//                            }
//                        }
//                    }
//                }
//            }
//
//            Box(modifier = Modifier.weight(1f)) {
//                GoogleMap(
//                    modifier = Modifier.fillMaxSize(),
//                    cameraPositionState = cameraPositionState,
//                    properties = MapProperties(isMyLocationEnabled = true),
//                    uiSettings = MapUiSettings(
//                        zoomControlsEnabled = true,
//                        myLocationButtonEnabled = true
//                    ),
//                    onMapClick = { latLng ->
//                        val geocoder = Geocoder(context)
//                        try {
//                            val addresses = geocoder.getFromLocation(
//                                latLng.latitude,
//                                latLng.longitude,
//                                1
//                            )
//                            addresses?.firstOrNull()?.let { address ->
//                                val locationName = address.getAddressLine(0) ?: ""
//                                onLocationSelected(
//                                    locationName,
//                                    latLng.latitude,
//                                    latLng.longitude
//                                )
//                            }
//                        } catch (e: Exception) {
//                            // Handle error
//                        }
//                    }
//                )
//            }
//
//            Row(
//                modifier = Modifier
//                    .fillMaxWidth()
//                    .padding(16.dp),
//                horizontalArrangement = Arrangement.End
//            ) {
//                TextButton(onClick = onDismiss) {
//                    Text("Cancel")
//                }
//            }
//        }
//    }
//}