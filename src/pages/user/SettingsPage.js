import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useAuth } from '../../context/AuthContext';

function statusMeta(status) {
  switch (status) {
    case 'APPROVED':
      return { label: 'Approved', textClass: 'text-green-600' };
    case 'REJECTED':
      return { label: 'Rejected', textClass: 'text-red-600' };
    default:
      return { label: 'Pending Review', textClass: 'text-amber-600' };
  }
}

export default function SettingsPage({ navigation }) {
  const { user, isLoading, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
  };

  const renderOrganizerSection = () => {
    if (isLoading && !user) {
      return (
        <View className="mt-8">
          <ActivityIndicator size="small" color="#0f172a" />
        </View>
      );
    }

    if (!user) {
      return null;
    }

    const application = user.organizerApplication ?? null;

    if (user.role === 'ORGANIZER') {
      return (
        <View className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 mt-8">
          <Text className="text-lg font-semibold text-emerald-700">You are an organizer</Text>
          <Text className="text-sm text-emerald-700 mt-2">
            You can now create and manage events for the community.
          </Text>
        </View>
      );
    }

    if (application) {
      const status = statusMeta(application.status);
      return (
        <View className="bg-slate-100 border border-slate-200 rounded-2xl p-5 mt-8">
          <Text className="text-base font-semibold text-slate-800 mb-1">Organizer application</Text>
          <Text className={`text-sm font-semibold ${status.textClass}`}>{status.label}</Text>
          {application.documentUrls?.length ? (
            <Text className="text-sm text-slate-600 mt-2">
              {application.documentUrls.length} document
              {application.documentUrls.length > 1 ? 's' : ''} uploaded
            </Text>
          ) : null}
          {application.reviewNotes ? (
            <Text className="text-sm text-amber-700 mt-2">Notes: {application.reviewNotes}</Text>
          ) : null}
          <TouchableOpacity
            className="bg-blue-600 px-5 py-3 rounded-xl mt-4"
            onPress={() => navigation.navigate('ApplyOrganizer')}
          >
            <Text className="text-white font-semibold text-center">
              {application.status === 'REJECTED' ? 'Resubmit application' : 'View application'}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (user.role === 'USER') {
      return (
        <View className="bg-slate-100 border border-slate-200 rounded-2xl p-5 mt-8">
          <Text className="text-base font-semibold text-slate-800 mb-1">Become an organizer</Text>
          <Text className="text-sm text-slate-600">
            Submit your credentials and IDs so the admin team can review and approve you to host
            events.
          </Text>
          <TouchableOpacity
            className="bg-blue-600 px-5 py-3 rounded-xl mt-4"
            onPress={() => navigation.navigate('ApplyOrganizer')}
          >
            <Text className="text-white font-semibold text-center">Apply to be an organizer</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (user.organizerRequestPending) {
      return (
        <Text className="text-center text-slate-500 mt-8">
          Your organizer application is currently pending review.
        </Text>
      );
    }

    return null;
  };

  return (
    <View className="flex-1 bg-white px-6 py-8">
      <Text className="text-2xl font-bold mb-6 text-slate-900">Settings</Text>

      {renderOrganizerSection()}

      <TouchableOpacity className="bg-red-600 px-6 py-3 rounded-xl mt-auto" onPress={handleLogout}>
        <Text className="text-white font-semibold text-center">Logout</Text>
      </TouchableOpacity>
    </View>
  );
}
