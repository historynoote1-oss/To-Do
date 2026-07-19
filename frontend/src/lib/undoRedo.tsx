// نظام تراجع/إعادة (Undo / Redo) مركزي — بيشتغل بنمط "الأوامر" (Command
// Pattern): أي عملية بتغيّر بيانات المستخدم (حذف مهمة، إضافة، تعديل، تبديل
// حالة إنجاز...) بتسجّل نفسها هنا كـ "أمر" فيه دالتين: undo() بترجع الحالة
// اللي قبل العملية، و redo() بتعيد تنفيذها تاني. بعد كده زرار Undo/Redo في
// شريط القائمة (Menu Bar) بيستخدموا الأوامر دي زي أي برنامج احترافي
// (Word, Photoshop, VS Code...).
//
// ليه Context مش prop-drilling؟ عشان TodoList بيتعرض في أكتر من مكان (الشاشة
// الرئيسية، التسلسل الهرمي، وقسم "بانتظار المراجعة") — الـ Context بيوفّر
// نفس الـ API لأي مكوّن من غير ما نمرر props يدويًا في كل مستوى.

import { createContext, useCallback, useContext, useMemo, useRef, useState, ReactNode } from 'react';
import { toast } from './toast';

export interface UndoableCommand {
  // وصف قصير للعملية بيتعرض كـ tooltip على زرار Undo/Redo، مثلاً: حذف "قراءة كتاب".
  label: string;
  undo: () => Promise<void> | void;
  redo: () => Promise<void> | void;
}

interface UndoRedoContextValue {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  isBusy: boolean;
  pushCommand: (command: UndoableCommand) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

const UndoRedoContext = createContext<UndoRedoContextValue | null>(null);

// أقصى عدد خطوات نحتفظ بيها في الذاكرة — كافي جدًا لأي جلسة استخدام عادية
// من غير ما يتضخم استهلاك الذاكرة لو المستخدم فضل يحذف/يضيف لساعات.
const MAX_HISTORY = 50;

export function UndoRedoProvider({ children }: { children: ReactNode }) {
  const [past, setPast] = useState<UndoableCommand[]>([]);
  const [future, setFuture] = useState<UndoableCommand[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  // بنستخدم ref عشان undo/redo يقدروا ياخدوا آخر قيمة فورًا من غير ما يستنوا
  // إعادة الرندر (مهم لو المستخدم ضغط Ctrl+Z مرتين بسرعة).
  const busyRef = useRef(false);

  const pushCommand = useCallback((command: UndoableCommand) => {
    setPast((prev) => {
      const next = [...prev, command];
      return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
    });
    // أي عملية جديدة بتلغي إمكانية الـ Redo (زي أي برنامج تحرير عادي).
    setFuture([]);
  }, []);

  const undo = useCallback(async () => {
    if (busyRef.current) return;
    let command: UndoableCommand | undefined;
    setPast((prev) => {
      if (prev.length === 0) return prev;
      command = prev[prev.length - 1];
      return prev.slice(0, -1);
    });
    if (!command) return;
    busyRef.current = true;
    setIsBusy(true);
    try {
      await command.undo();
      setFuture((prev) => [...prev, command!]);
    } catch (err) {
      // لو التراجع فشل (مثلاً مشكلة شبكة)، نرجع الأمر لمكانه في السجل عشان
      // المستخدم يقدر يحاول تاني، بدل ما نضيّعه بصمت.
      setPast((prev) => [...prev, command!]);
      toast.error(err instanceof Error ? err.message : 'تعذّر التراجع عن العملية');
    } finally {
      busyRef.current = false;
      setIsBusy(false);
    }
  }, []);

  const redo = useCallback(async () => {
    if (busyRef.current) return;
    let command: UndoableCommand | undefined;
    setFuture((prev) => {
      if (prev.length === 0) return prev;
      command = prev[prev.length - 1];
      return prev.slice(0, -1);
    });
    if (!command) return;
    busyRef.current = true;
    setIsBusy(true);
    try {
      await command.redo();
      setPast((prev) => [...prev, command!]);
    } catch (err) {
      setFuture((prev) => [...prev, command!]);
      toast.error(err instanceof Error ? err.message : 'تعذّرت إعادة تنفيذ العملية');
    } finally {
      busyRef.current = false;
      setIsBusy(false);
    }
  }, []);

  const value = useMemo<UndoRedoContextValue>(
    () => ({
      canUndo: past.length > 0,
      canRedo: future.length > 0,
      undoLabel: past.length > 0 ? past[past.length - 1].label : null,
      redoLabel: future.length > 0 ? future[future.length - 1].label : null,
      isBusy,
      pushCommand,
      undo,
      redo,
    }),
    [past, future, isBusy, pushCommand, undo, redo]
  );

  return <UndoRedoContext.Provider value={value}>{children}</UndoRedoContext.Provider>;
}

export function useUndoRedo() {
  const ctx = useContext(UndoRedoContext);
  if (!ctx) {
    throw new Error('useUndoRedo لازم يتستخدم جوه UndoRedoProvider');
  }
  return ctx;
}
