import React, { useState } from "react";
import { View, Text, Image, TouchableOpacity, TextInput, StyleSheet } from "react-native";
import * as DocumentPicker from "expo-document-picker";

export default function BookingPage({ route, navigation }) {
  const { event } = route.params; // Passed from EventDetailsPage
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(false);

  // Pick GCash receipt (image or PDF)
  const pickReceipt = async () => {
    let result = await DocumentPicker.getDocumentAsync({
      type: ["image/*", "application/pdf"],
    });
    if (result.type !== "cancel") {
      setReceipt(result);
    }
  };

  const confirmBooking = async () => {
    if (!receipt) {
      alert("Please upload your GCash receipt.");
      return;
    }
    setLoading(true);

    const formData = new FormData();
    formData.append("eventId", event.id);
    formData.append("amount", event.price);
    formData.append("receipt", {
      uri: receipt.uri,
      name: receipt.name || "receipt.jpg",
      type: receipt.mimeType || "image/jpeg",
    });

    try {
      const res = await fetch("http://localhost:3000/api/bookings", {
        method: "POST",
        body: formData,
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (res.ok) {
        navigation.navigate("ReceiptPage", { event });
      } else {
        alert("Failed to confirm booking");
      }
    } catch (error) {
      console.error(error);
      alert("Something went wrong");
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
        <Text>Organizer: {event.organizerName}</Text>
        <Text>
            Total: ₱ {event?.price ? Number(event.price).toLocaleString() : "Free"}
        </Text>
      </View>

      <TouchableOpacity style={styles.uploadBtn} onPress={pickReceipt}>
        <Text>{receipt ? "Receipt Selected ✅" : "Upload GCash Receipt"}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.confirmBtn}
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
  summary: { marginBottom: 20 },
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
  cancelBtn: { alignItems: "center", marginTop: 10 },
});
