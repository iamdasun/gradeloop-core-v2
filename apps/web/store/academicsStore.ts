import create from "zustand";

type State = {
  selectedFacultyId?: string;
  setFaculty: (id?: string) => void;
};

export const useAcademicsStore = create<State>((set) => ({
  selectedFacultyId: undefined,
  setFaculty: (id) => set({ selectedFacultyId: id }),
}));
