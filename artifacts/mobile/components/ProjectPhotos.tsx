import { Feather } from "@expo/vector-icons";
import {
  getListProjectPhotosQueryKey,
  useCreateProjectPhoto,
  useDeleteProjectPhoto,
  useListProjectPhotos,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  View,
} from "react-native";

import { Body, Card, EmptyState, Loader, Muted, SectionTitle } from "./ui";
import { useColors } from "@/hooks/useColors";
import {
  pickFromCamera,
  pickFromLibrary,
  uploadAsset,
  type PickedAsset,
} from "@/lib/upload";

const GAP = 6;

export function ProjectPhotos({ projectId }: { projectId: string }) {
  const c = useColors();
  const qc = useQueryClient();
  const photosQ = useListProjectPhotos({ projectId });
  const createMut = useCreateProjectPhoto();
  const deleteMut = useDeleteProjectPhoto();
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState<{ url: string; name: string } | null>(
    null,
  );

  const invalidate = () =>
    qc.invalidateQueries({
      queryKey: getListProjectPhotosQueryKey({ projectId }),
    });

  const handleAsset = async (asset: PickedAsset | null) => {
    if (!asset) return;
    setBusy(true);
    try {
      const up = await uploadAsset(asset);
      await createMut.mutateAsync({
        data: {
          projectId,
          fileUrl: up.fileUrl,
          fileName: up.fileName,
        },
      });
      await invalidate();
    } catch (err) {
      Alert.alert(
        "アップロードに失敗しました",
        err instanceof Error ? err.message : "もう一度お試しください",
      );
    } finally {
      setBusy(false);
    }
  };

  const onPickSource = () => {
    Alert.alert(
      "写真を追加",
      undefined,
      [
        {
          text: "カメラで撮影",
          onPress: async () => handleAsset(await pickFromCamera()),
        },
        {
          text: "ライブラリから選択",
          onPress: async () => handleAsset(await pickFromLibrary()),
        },
        { text: "キャンセル", style: "cancel" },
      ],
      { cancelable: true },
    );
  };

  const onAskDelete = (id: string) => {
    Alert.alert("この写真を削除しますか?", undefined, [
      { text: "キャンセル", style: "cancel" },
      {
        text: "削除する",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteMut.mutateAsync({ id });
            await invalidate();
          } catch (err) {
            Alert.alert(
              "削除に失敗しました",
              err instanceof Error ? err.message : "もう一度お試しください",
            );
          }
        },
      },
    ]);
  };

  const photos = photosQ.data ?? [];

  return (
    <Card>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <SectionTitle>現場写真</SectionTitle>
        <Pressable
          onPress={onPickSource}
          disabled={busy}
          hitSlop={8}
          style={({ pressed }) => [
            {
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 6,
              backgroundColor: c.primary,
              opacity: busy ? 0.6 : 1,
            },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Feather name="camera" size={12} color={c.primaryForeground} />
          <Body
            style={{ color: c.primaryForeground, fontSize: 12, fontWeight: "600" }}
          >
            {busy ? "アップロード中…" : "写真を追加"}
          </Body>
        </Pressable>
      </View>
      {photosQ.isLoading ? (
        <Loader />
      ) : photos.length === 0 ? (
        <EmptyState icon="image" title="現場写真がありません" />
      ) : (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            marginHorizontal: -GAP / 2,
          }}
        >
          {photos.map((p) => (
            <View
              key={p.id}
              style={{
                width: "33.3333%",
                padding: GAP / 2,
              }}
            >
              <Pressable
                onPress={() => setViewer({ url: p.fileUrl, name: p.fileName })}
                onLongPress={() => onAskDelete(p.id)}
                style={({ pressed }) => [
                  {
                    aspectRatio: 1,
                    backgroundColor: c.muted,
                    borderRadius: 6,
                    overflow: "hidden",
                    borderWidth: 1,
                    borderColor: c.border,
                  },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Image
                  source={{ uri: p.fileUrl }}
                  style={{ width: "100%", height: "100%" }}
                  resizeMode="cover"
                />
                <Pressable
                  onPress={() => onAskDelete(p.id)}
                  hitSlop={8}
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    backgroundColor: "rgba(0,0,0,0.55)",
                    borderRadius: 12,
                    padding: 4,
                  }}
                >
                  <Feather name="trash-2" size={12} color="#fff" />
                </Pressable>
              </Pressable>
            </View>
          ))}
        </View>
      )}
      {photos.length > 0 ? (
        <Muted style={{ fontSize: 11, marginTop: 8 }}>
          長押しまたはゴミ箱アイコンで削除できます
        </Muted>
      ) : null}

      <Modal
        visible={!!viewer}
        transparent
        animationType="fade"
        onRequestClose={() => setViewer(null)}
      >
        <Pressable
          onPress={() => setViewer(null)}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.92)",
            justifyContent: "center",
          }}
        >
          {viewer ? (
            <ScrollView
              maximumZoomScale={4}
              minimumZoomScale={1}
              contentContainerStyle={{
                flexGrow: 1,
                justifyContent: "center",
              }}
            >
              <Image
                source={{ uri: viewer.url }}
                style={{ width: "100%", aspectRatio: 1 }}
                resizeMode="contain"
              />
            </ScrollView>
          ) : null}
          <View
            style={{
              position: "absolute",
              top: 50,
              right: 16,
            }}
          >
            <Pressable
              onPress={() => setViewer(null)}
              hitSlop={12}
              style={{
                backgroundColor: "rgba(255,255,255,0.2)",
                borderRadius: 24,
                padding: 10,
              }}
            >
              <Feather name="x" size={20} color="#fff" />
            </Pressable>
          </View>
          {viewer ? (
            <View
              style={{
                position: "absolute",
                bottom: 40,
                left: 16,
                right: 16,
              }}
            >
              <Body
                style={{ color: "#fff", textAlign: "center" }}
                numberOfLines={2}
              >
                {viewer.name}
              </Body>
            </View>
          ) : null}
        </Pressable>
      </Modal>
    </Card>
  );
}
