export function sourceFixture() {
  return { schema: "injiaoyun-migration-draft-v1", sourceSystem: "音教雲", date: "2026-10-14",
    students: [{ sourceStudentId: "synthetic-student", name: "虛構學員", phone: "0912345678", notes: "", legacyLineStatus: "已綁定", targetCustomerId: null }],
    tuition: [], attendanceGroups: [], schedule: [],
    sourceRecords: [{ id: "synthetic-student", name: "虛構學員", tuition: [], attendance: { tables: [] }, schedule: { tables: [] } }],
  };
}
