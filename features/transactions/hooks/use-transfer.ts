import { create } from "zustand";

type TransferState = {
  isOpen: boolean;
  fromAccountId?: string;
  onOpen: (fromAccountId?: string) => void;
  onClose: () => void;
};

export const useTransfer = create<TransferState>((set) => ({
  isOpen: false,
  fromAccountId: undefined,
  onOpen: (fromAccountId?: string) => set({ isOpen: true, fromAccountId }),
  onClose: () => set({ isOpen: false, fromAccountId: undefined }),
}));
