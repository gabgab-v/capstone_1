import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import Icon from "react-native-vector-icons/Feather";
import { post } from "../lib/api"; // ✅ use the same helper as login

export default function CreateEventPage() {
  const [title, setTitle] = useState("");
  const [distanceKm, setDistanceKm] = useState("");
  const [durationHrs, setDurationHrs] = useState("");
  const [steps, setSteps] = useState("");
  const [elevationM, setElevationM] = useState("");
  const [price, setPrice] = useState("");
  const [gcashNumber, setGcashNumber] = useState(""); // ✅ Add state for GCash number

  const handleCreateEvent = async () => {
    // Basic validation
    if (!title || !price || !gcashNumber) {
        Alert.alert("Missing Information", "Please fill out the title, price, and GCash number.");
        return;
    }

    try {
      const data = await post("/api/events", {
        title,
        distanceKm: parseFloat(distanceKm) || 0,
        durationHrs: parseFloat(durationHrs) || 0,
        steps: parseInt(steps) || 0,
        elevationM: parseFloat(elevationM) || 0,
        price: parseFloat(price) || 0,
        gcashNumber, // ✅ Send GCash number to the backend
      });

      Alert.alert("Success", "Event created successfully!");
      console.log("✅ Event created:", data);
      // Optional: clear form or navigate away
    } catch (err) {
      console.error(err);
      Alert.alert("Error", err.message || "Something went wrong");
    }
  };

  return (
    <ScrollView style={styles.container}>
      {/* Header Image Section */}
      <TouchableOpacity style={styles.headerImageContainer}>
        <View style={styles.imagePlaceholder}>
          <Icon name="image" size={80} color="#999" />
          <TouchableOpacity style={styles.galleryIconContainer}>
            <Icon name="plus-circle" size={24} color="#FFF" />
          </TouchableOpacity>
        </View>
        <View style={styles.titleContainer}>
          <TextInput
            placeholder="Add Title"
            value={title}
            onChangeText={setTitle}
            style={styles.titleInput}
            placeholderTextColor="#FFF"
          />
          <Icon name="edit-2" size={20} color="#FFF" style={{ marginLeft: 8 }} />
        </View>
      </TouchableOpacity>

      {/* Tab Navigation Placeholder */}
      <View style={styles.tabBar}>
        <Text style={styles.tabItem}>Overview</Text>
        <Text style={styles.tabItemActive}>Details</Text>
        <Text style={styles.tabItem}>Itinerary</Text>
        <Text style={styles.tabItem}>Directions</Text>
      </View>

      {/* Main Content Area */}
      <View style={styles.contentContainer}>
        {/* Map Placeholder */}
        <TouchableOpacity style={styles.mapPlaceholder}>
          <Icon name="plus" size={60} color="#AAA" />
          <Text style={styles.mapPlaceholderText}>Add Map</Text>
        </TouchableOpacity>

        {/* Hike Details Section */}
        <View style={styles.detailsGrid}>
          <View style={styles.infoField}>
            <Text style={styles.infoLabel}>Distance (km)</Text>
            <TextInput
              style={styles.input}
              value={distanceKm}
              onChangeText={setDistanceKm}
              keyboardType="numeric"
              placeholder="0"
            />
          </View>

          <View style={styles.infoField}>
            <Text style={styles.infoLabel}>Estimated Time (hrs)</Text>
            <TextInput
              style={styles.input}
              value={durationHrs}
              onChangeText={setDurationHrs}
              keyboardType="numeric"
              placeholder="0"
            />
          </View>

          <View style={styles.infoField}>
            <Text style={styles.infoLabel}>Steps</Text>
            <TextInput
              style={styles.input}
              value={steps}
              onChangeText={setSteps}
              keyboardType="numeric"
              placeholder="0"
            />
          </View>

          <View style={styles.infoField}>
            <Text style={styles.infoLabel}>Elevation (m)</Text>
            <TextInput
              style={styles.input}
              value={elevationM}
              onChangeText={setElevationM}
              keyboardType="numeric"
              placeholder="0"
            />
          </View>

          <View style={styles.infoField}>
            <Text style={styles.infoLabel}>Price (₱)</Text>
            <TextInput
              style={styles.input}
              value={price}
              onChangeText={setPrice}
              keyboardType="numeric"
              placeholder="0"
            />
          </View>
          
          {/* ✅ New GCash Number Input */}
          <View style={styles.infoField}>
            <Text style={styles.infoLabel}>GCash Number</Text>
            <TextInput
              style={styles.input}
              value={gcashNumber}
              onChangeText={setGcashNumber}
              keyboardType="phone-pad"
              placeholder="e.g., 09123456789"
            />
          </View>

        </View>

        {/* Submit Button */}
        <TouchableOpacity style={styles.createButton} onPress={handleCreateEvent}>
          <Text style={styles.createButtonText}>Create Event</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// --- Styles unchanged ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  headerImageContainer: {
    height: 250,
    backgroundColor: "#E0E0E0",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  imagePlaceholder: { justifyContent: "center", alignItems: "center", opacity: 0.5 },
  galleryIconContainer: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 15,
    padding: 2,
  },
  titleContainer: {
    position: "absolute",
    bottom: 20,
    left: 20,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  titleInput: { fontSize: 28, fontWeight: "bold", color: "#FFFFFF" },
  tabBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EEE",
    backgroundColor: "#FFF",
  },
  tabItem: { fontSize: 16, color: "#999" },
  tabItemActive: {
    fontSize: 16,
    color: "#2E7D32",
    fontWeight: "bold",
    borderBottomWidth: 2,
    borderBottomColor: "#2E7D32",
    paddingBottom: 4,
  },
  contentContainer: { padding: 20 },
  mapPlaceholder: {
    height: 200,
    backgroundColor: "#F5F5F5",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    marginBottom: 24,
  },
  mapPlaceholderText: { marginTop: 8, fontSize: 16, color: "#AAA" },
  detailsGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  infoField: { width: "48%", marginBottom: 16 },
  infoLabel: { fontSize: 14, color: "#666", marginBottom: 4 },
  input: {
    backgroundColor: "#F5F5F5",
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    color: "#333",
    height: 45,
  },
  createButton: {
    backgroundColor: "#2E7D32",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 20,
  },
  createButtonText: { color: "#FFF", fontSize: 18, fontWeight: "bold" },
});