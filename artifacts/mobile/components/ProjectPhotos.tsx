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
  Image,
  Modal,
  Pressable,
  ScrollView,
  View,
} from "react-native";

import { ActionSheetModal } from "./ActionSheetModal";
import { Body, Card, EmptyState, Loader, Muted, SectionTitle } from "./ui";
import { useColors } from "@/hooks/useColors";
import { confirmDestructive, notify } from "@/lib/confirm";
import { runBulkDelete } from "@/lib/bulk-delete";
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
  const [sheetOpen, setSheetOpen] = useState(false);
  const [viewer, setViewer] = useState<{ url: string; name: string } | null>(
    null,
  );
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

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
      notify(
        "アップロードに失敗しました",
        err instanceof Error ? err.message : "もう一度お試しください",
      );
    } finally {
      setBusy(false);
    }
  };

  const onAskDelete = async (id: string) => {
    const ok = await confirmDestructive({
      title: "この写真を削除しますか?",
      confirmLabel: "削除する",
    });
    if (!ok) return;
    try {
      await deleteMut.mutateAsync({ id });
      await invalidate();
    } catch (err) {
      notify(
        "削除に失敗しました",
        err instanceof Error ? err.message : "もう一度お試しください",
      );
    }
  };

  const photos = photosQ.data ?? [];

  const enterSelection = () => {
    setSelectionMode(true);
    setSelected(new Set());
  };
  const exitSelection = () => {
    setSelectionMode(false);
    setSelected(new Set());
  };
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(photos.map((p) => p.id)));
  const onBulkDelete = async () => {
    if (selected.size === 0) return;
    const ok = await confirmDestructive({
      title: "選択した写真を削除",
      message: `${selected.size} 件の写真を削除します。元に戻せません。`,
      confirmLabel: "削除する",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const items = photos.filter((p) => selected.has(p.id));
      await runBulkDelete(
        items,
        (id) => deleteMut.mutateAsync({ id }),
        () => invalidate(),
      );
      exitSelection();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        <SectionTitle>現場写真</SectionTitle>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {photos.length > 0 && !selectionMode ? (
            <Pressable
              onPress={enterSelection}
              hitSlop={6}
              style={({ pressed }) => [
                {
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: c.border,
                  backgroundColor: c.card,
                },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Feather name="check-square" size={12} color={c.foreground} />
              <Body style={{ fontSize: 12, fontWeight: "600" }}>選択</Body>
            </Pressable>
          ) : null}
          {!selectionMode ? (
            <Pressable
              onPress={() => setSheetOpen(true)}
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
                style={{
                  color: c.primaryForeground,
                  fontSize: 12,
                  fontWeight: "600",
                }}
              >
                {busy ? "アップロード中…" : "写真を追加"}
              </Body>
            </Pressable>
          ) : null}
        </View>
      </View>

      {selectionMode ? (
        <View
          style={{
            backgroundColor: c.primary,
            borderRadius: 8,
            paddingVertical: 8,
            paddingHorizontal: 10,
            marginBottom: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Pressable onPress={exitSelection} hitSlop={6}>
            <Feather name="x" size={18} color={c.primaryForeground} />
          </Pressable>
          <Body
            style={{ flex: 1, color: c.primaryForeground, fontWeight: "700" }}
          >
            {selected.size}件選択
          </Body>
          {selected.size < photos.length ? (
            <Pressable onPress={selectAll} hitSlop={6}>
              <Body
                style={{
                  color: c.primaryForeground,
                  fontWeight: "600",
                  fontSize: 12,
                }}
              >
                全選択
              </Body>
            </Pressable>
          ) : null}
          <Pressable
            onPress={onBulkDelete}
            disabled={busy || selected.size === 0}
            hitSlop={6}
            style={({ pressed }) => [
              {
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 6,
                backgroundColor: c.destructive,
                opacity: busy || selected.size === 0 ? 0.5 : 1,
              },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Feather name="trash-2" size={14} color="#fff" />
            <Body style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>
              削除
            </Body>
          </Pressable>
        </View>
      ) : null}

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
          {photos.map((p) => {
            const isSel = selected.has(p.id);
            return (
              <View
                key={p.id}
                style={{
                  width: "33.3333%",
                  padding: GAP / 2,
                }}
              >
                <Pressable
                  onPress={() => {
                    if (selectionMode) toggleSelect(p.id);
                    else setViewer({ url: p.fileUrl, name: p.fileName });
                  }}
                  onLongPress={() => {
                    if (selectionMode) toggleSelect(p.id);
                    else {
                      enterSelection();
                      setSelected(new Set([p.id]));
                    }
                  }}
                  style={({ pressed }) => [
                    {
                      aspectRatio: 1,
                      backgroundColor: c.muted,
                      borderRadius: 6,
                      overflow: "hidden",
                      borderWidth: isSel ? 3 : 1,
                      borderColor: isSel ? c.primary : c.border,
                    },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Image
                    source={{ uri: p.fileUrl }}
                    style={{ width: "100%", height: "100%" }}
                    resizeMode="cover"
                  />
                  {selectionMode ? (
                    <View
                      style={{
                        position: "absolute",
                        top: 4,
                        left: 4,
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        borderWidth: 2,
                        borderColor: isSel ? c.primary : "#fff",
                        backgroundColor: isSel ? c.primary : "rgba(0,0,0,0.4)",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {isSel ? (
                        <Feather
                          name="check"
                          size={14}
                          color={c.primaryForeground}
                        />
                      ) : null}
                    </View>
                  ) : (
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
                  )}
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      <ActionSheetModal
        visible={sheetOpen}
        title="写真を追加"
        onClose={() => setSheetOpen(false)}
        options={[
          {
            label: "カメラで撮影",
            icon: "camera",
            onPress: async () => handleAsset(await pickFromCamera()),
          },
          {
            label: "ライブラリから選択",
            icon: "image",
            onPress: async () => handleAsset(await pickFromLibrary()),
          },
        ]}
      />

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
