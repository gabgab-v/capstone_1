import React, { useState } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet, Alert } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { postFormData } from "../../lib/api"; // This import now correctly points to the new function

export default function BookingPage({ route, navigation }) {
  const { event } = route.params;
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(false);

  const pickReceipt = async () => {
    try {
        let result = await DocumentPicker.getDocumentAsync({
            type: ["image/*", "application/pdf"],
        });

        // The new SDK returns an object with an `assets` array
        if (!result.canceled && result.assets && result.assets.length > 0) {
            setReceipt(result.assets[0]);
        }
    } catch (error) {
        console.error("Error picking document:", error);
        Alert.alert("Error", "Could not pick the document.");
    }
  };

  const confirmBooking = async () => {
    if (!receipt) {
      Alert.alert("Upload Required", "Please upload your GCash receipt.");
      return;
    }
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("eventId", event.id);
      formData.append("amount", event.price);
      formData.append("receipt", {
        uri: receipt.uri,
        name: receipt.name || "receipt.jpg",
        type: receipt.mimeType || "image/jpeg",
      });

      const booking = await postFormData("/api/bookings", formData);

      console.log("✅ Booking created:", booking);
      navigation.navigate("ReceiptPage", { event, booking });

    } catch (err) {
      console.error("❌ Booking failed:", err);
      const errorMessage = err.body?.error || err.message || "Something went wrong while booking.";
      Alert.alert("Booking Failed", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Image source={{ uri: event.imageUrl }} style={styles.image} />
      <Text style={styles.title}>{event.title}</Text>
      <Text style={styles.price}>
        ₱ {event?.price ? Number(event.price).toLocaleString() : "Free"}
      </Text>

      <View style={styles.summary}>
        <Text style={styles.detailText}>
            <Text style={styles.detailLabel}>Organizer:</Text> {event.organizer?.email || "N/A"}
        </Text>
        
        {/* ✅ Displays the GCash number from the organizer, with a fallback */}
        <Text style={styles.detailText}>
            <Text style={styles.detailLabel}>Send Payment To (GCash):</Text> {event.organizer?.gcashNumber || "Not Provided"}
        </Text>
        
        <Text style={styles.detailText}>
            <Text style={styles.detailLabel}>Total:</Text> ₱ {event?.price ? Number(event.price).toLocaleString() : "Free"}
        </Text>
      </View>

      <TouchableOpacity style={styles.uploadBtn} onPress={pickReceipt}>
        <Text>{receipt ? `Selected: ${receipt.name}` : "Upload GCash Receipt"}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.confirmBtn, loading && styles.disabledBtn]}
        onPress={confirmBooking}
        disabled={loading}
      >
        <Text style={{ color: "white" }}>
          {loading ? "Booking..." : "Confirm Booking"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.cancelBtn}
        onPress={() => navigation.goBack()}
        disabled={loading}
      >
        <Text>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#fff" },
  image: { width: "100%", height: 200, borderRadius: 10 },
  title: { fontSize: 20, fontWeight: "bold", marginVertical: 10 },
  price: { fontSize: 16, color: "green", marginBottom: 20 },
  summary: { 
    marginBottom: 20, 
    padding: 15, 
    backgroundColor: '#f9f9f9', 
    borderRadius: 8 
  },
  // ✅ Added new styles for clarity
  detailText: {
    fontSize: 14,
    lineHeight: 22,
  },
  detailLabel: {
    fontWeight: 'bold',
  },
  uploadBtn: {
    padding: 12,
    backgroundColor: "#eee",
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 10,
  },
  confirmBtn: {
    padding: 15,
    backgroundColor: "green",
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 10,
  },
  disabledBtn: {
    backgroundColor: 'grey',
  },
  cancelBtn: { alignItems: "center", marginTop: 10 },
});