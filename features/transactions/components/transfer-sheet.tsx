"use client";

import React from "react";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { client } from "@/lib/hono";
import {
  convertAmountToMiliunits,
  convertAmountFromMiliunits,
  toastAlert,
} from "@/lib/utils";

import { useGetAccounts } from "@/features/accounts/api/use-get-accounts";
import { useGetCategories } from "@/features/categories/api/use-get-categories";
import { useCreateCategory } from "@/features/categories/api/use-create-category";
import { useBulkCreateTransactions } from "@/features/transactions/api/use-bulk-create-transactions";
import { useTransfer } from "@/features/transactions/hooks/use-transfer";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Select } from "@/components/select";
import { AmountInput } from "@/components/amount-input";
import { DatePicker } from "@/components/date-picker";

const formSchema = z.object({
  date: z.coerce.date(),
  fromAccountId: z.string(),
  toAccountId: z.string(),
  amount: z.string(),
  notes: z.string().nullable().optional(),
});

type FormValues = z.input<typeof formSchema>;

export const TransferSheet = () => {
  const { isOpen, onClose, fromAccountId } = useTransfer();

  const accountsQuery = useGetAccounts();
  const categoryQuery = useGetCategories();
  const createCategory = useCreateCategory();
  const bulkCreate = useBulkCreateTransactions();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      date: new Date(),
      fromAccountId: fromAccountId ?? undefined,
      toAccountId: undefined,
      amount: "",
    },
  });

  // balance query for selected from account. Use either the form value or the preselected id from the hook.
  const watchedFrom = form.watch("fromAccountId");
  const selectedFrom = watchedFrom ?? fromAccountId;

  const balanceQuery = useQuery({
    queryKey: ["account-balance", selectedFrom],
    queryFn: async () => {
      if (!selectedFrom) return { remainingAmount: 0 };
      const to = new Date().toISOString().slice(0, 10);
      const from = "1970-01-01";
      const response = await client.api.summary.$get({
        query: { accountId: selectedFrom, from, to },
      });
      const json = (await response.json()) as any;
      return json?.data ?? { remainingAmount: 0 };
    },
    // only fetch when the sheet is open and we have a selected account
    enabled: isOpen && !!selectedFrom,
  });

  // reset form when the sheet opens or when the preselected fromAccountId changes
  React.useEffect(() => {
    if (isOpen) {
      form.reset({
        date: new Date(),
        fromAccountId: fromAccountId ?? undefined,
        toAccountId: undefined,
        amount: "",
      });
    }
  }, [isOpen, fromAccountId]);

  const accountOptions = (accountsQuery.data ?? []).map((a: any) => ({
    label: a.name,
    value: a.id,
  }));

  const isLoading = accountsQuery.isLoading || categoryQuery.isLoading;

  const onSubmit = async (values: FormValues) => {
    const amountFloat = parseFloat(values.amount.replace(",", "."));
    if (isNaN(amountFloat) || amountFloat <= 0) return;

    const amountMili = convertAmountToMiliunits(amountFloat);

    // basic validations
    if (values.fromAccountId === values.toAccountId) {
      toastAlert("Selecione contas diferentes para transferência", "danger");
      return;
    }

    if (Math.abs(amountMili) > Math.abs(remaining)) {
      toastAlert("Saldo insuficiente na conta de origem", "danger");
      return;
    }

    // ensure category exists
    const transferCategoryName = "Transferências";
    let transferCategory = (categoryQuery.data ?? []).find(
      (c: any) => c.name === transferCategoryName,
    );

    if (!transferCategory) {
      const res = (await createCategory.mutateAsync({
        name: transferCategoryName,
      })) as any;
      transferCategory = res?.data;
    }

    if (!transferCategory) {
      toastAlert("Erro ao criar categoria de transferências", "danger");
      return;
    }

    // create two transactions: negative for from, positive for to
    const fromAccountName = (accountsQuery.data ?? []).find(
      (a: any) => a.id === values.fromAccountId,
    )?.name;
    const toAccountName = (accountsQuery.data ?? []).find(
      (a: any) => a.id === values.toAccountId,
    )?.name;

    const payload = [
      {
        date: values.date,
        accountId: values.fromAccountId,
        categoryId: transferCategory.id,
        payee: `Transferência para ${toAccountName ?? values.toAccountId}`,
        amount: -Math.abs(amountMili),
        notes: values.notes ?? null,
      },
      {
        date: values.date,
        accountId: values.toAccountId,
        categoryId: transferCategory.id,
        payee: `Transferência de ${fromAccountName ?? values.fromAccountId}`,
        amount: Math.abs(amountMili),
        notes: values.notes ?? null,
      },
    ];

    await bulkCreate.mutateAsync(payload as any);

    // reset form after successful submit and then close
    form.reset({
      date: new Date(),
      fromAccountId: fromAccountId ?? undefined,
      toAccountId: undefined,
      amount: "",
    });

    onClose();
  };

  const remaining = balanceQuery.data?.remainingAmount ?? 0;
  const remainingDisplay = convertAmountFromMiliunits(remaining);

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="space-y-4">
        <SheetHeader>
          <SheetTitle>Transferência entre contas</SheetTitle>
          <SheetDescription>Mover valor entre contas</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="size-4 text-muted-foreground animate-spin" />
          </div>
        ) : (
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-4 pt-4"
            >
              <FormField
                name="date"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data</FormLabel>
                    <FormControl>
                      <DatePicker
                        value={field.value as Date}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="fromAccountId"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Conta (Origem)</FormLabel>
                    <FormControl>
                      <Select
                        options={accountOptions}
                        value={field.value}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="text-sm text-muted-foreground">
                Saldo disponível: {remainingDisplay}
              </div>

              <FormField
                name="toAccountId"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Conta (Destino)</FormLabel>
                    <FormControl>
                      <Select
                        options={accountOptions}
                        value={field.value}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="amount"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valor</FormLabel>
                    <FormControl>
                      <AmountInput {...field} placeholder="0.00" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div>
                <Button className="w-full" disabled={false}>
                  Efetuar transferência
                </Button>
              </div>
            </form>
          </Form>
        )}
      </SheetContent>
    </Sheet>
  );
};
