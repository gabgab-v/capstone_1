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
import * as ImagePicker from "expo-image-picker";
import { Image } from "react-native";
import { post } from "../lib/api";

export default function CreateEventPage() {
  const [activeTab, setActiveTab] = useState("overview");

  // Event fields
  const [title, setTitle] = useState("");
  const [overview, setOverview] = useState("");   // ✅ New
  const [itinerary, setItinerary] = useState(""); // ✅ New
  const [directions, setDirections] = useState(""); // ✅ For Mapbox
  const [distanceKm, setDistanceKm] = useState("");
  const [durationHrs, setDurationHrs] = useState("");
  const [steps, setSteps] = useState("");
  const [elevationM, setElevationM] = useState("");
  const [price, setPrice] = useState("");
  const [gcashNumber, setGcashNumber] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);

  const pickImage = async () => {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

  console.log("Permission Result:", permission); // <-- ADD THIS

  if (!permission.granted) {
    Alert.alert("Permission required", "We need access to your photos.");
    return;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images, // Corrected from MediaType.Images
    quality: 1,
  });

  console.log("Image Picker Result:", JSON.stringify(result, null, 2)); // <-- ADD THIS

  if (!result.canceled) {
    const uri = result.assets[0].uri;
    console.log("Selected Image URI:", uri); // <-- ADD THIS
    setSelectedImage(uri);
  } else {
    console.log("User canceled image picking."); // <-- ADD THIS
  }
};

  const handleCreateEvent = async () => {
    if (!title || !price || !gcashNumber) {
      Alert.alert(
        "Missing Information",
        "Please fill out the title, price, and GCash number."
      );
      return;
    }

  


    try {
      const data = await post("/api/events", {
        title,
        overview,
        itinerary,
        directions,
        distanceKm: parseFloat(distanceKm) || 0,
        durationHrs: parseFloat(durationHrs) || 0,
        steps: parseInt(steps) || 0,
        elevationM: parseFloat(elevationM) || 0,
        price: parseFloat(price) || 0,
        gcashNumber,
        imageUrl: selectedImage,
      });

      Alert.alert("Success", "Event created successfully!");
      console.log("✅ Event created:", data);
    } catch (err) {
      console.error(err);
      Alert.alert("Error", err.message || "Something went wrong");
    }
  };

  return (
    <ScrollView style={styles.container}>
      {/* Header Image Section */}
      <TouchableOpacity style={styles.headerImageContainer} onPress={pickImage}>
        {selectedImage ? (
          <Image source={{ uri: selectedImage }} style={styles.selectedImage} />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Icon name="image" size={80} color="#999" />
            <TouchableOpacity style={styles.galleryIconContainer}>
              <Icon name="plus-circle" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>
        )}
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

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        {["overview", "details", "itinerary", "directions"].map((tab) => (
          <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)}>
            <Text
              style={[
                styles.tabItem,
                activeTab === tab && styles.tabItemActive,
              ]}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab Content */}
      <View style={styles.contentContainer}>
        {activeTab === "overview" && (
          <View>
            <Text style={styles.infoLabel}>Overview</Text>
            <TextInput
              style={[styles.input, { height: 100, textAlignVertical: "top" }]}
              multiline
              value={overview}
              onChangeText={setOverview}
              placeholder="Write an overview of the event..."
            />
          </View>
        )}

        {activeTab === "details" && (
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
        )}

        {activeTab === "itinerary" && (
          <View>
            <Text style={styles.infoLabel}>Itinerary</Text>
            <TextInput
              style={[styles.input, { height: 150, textAlignVertical: "top" }]}
              multiline
              value={itinerary}
              onChangeText={setItinerary}
              placeholder="Day 1: ...&#10;Day 2: ...&#10;etc."
            />
          </View>
        )}

        {activeTab === "directions" && (
          <View>
            <Text style={styles.infoLabel}>Directions (Mapbox later)</Text>
            <TextInput
              style={[styles.input, { height: 100, textAlignVertical: "top" }]}
              multiline
              value={directions}
              onChangeText={setDirections}
              placeholder="Add directions or map reference..."
            />
            <TouchableOpacity style={styles.mapPlaceholder}>
              <Icon name="map-pin" size={50} color="#AAA" />
              <Text style={styles.mapPlaceholderText}>Add Map Location</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Submit Button */}
        <TouchableOpacity style={styles.createButton} onPress={handleCreateEvent}>
          <Text style={styles.createButtonText}>Create Event</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

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
  mapPlaceholder: {
    height: 180,
    backgroundColor: "#F5F5F5",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    marginTop: 16,
  },
  mapPlaceholderText: { marginTop: 8, fontSize: 16, color: "#AAA" },
  createButton: {
    backgroundColor: "#2E7D32",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 30,
  },
  createButtonText: { color: "#FFF", fontSize: 18, fontWeight: "bold" },
  selectedImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover", // This ensures the image covers the area nicely
  },
});
