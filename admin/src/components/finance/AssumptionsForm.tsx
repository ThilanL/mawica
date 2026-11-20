import type { FinanceAssumptions } from "@/modules/staff/finance/types";

function Field({
  name,
  label,
  defaultValue,
  step = "any",
}: {
  name: string;
  label: string;
  defaultValue: number | string;
  step?: string;
}) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-[var(--admin-muted)]">{label}</span>
      <input
        name={name}
        type="number"
        step={step}
        defaultValue={defaultValue}
        className="w-full rounded-xl border border-[var(--admin-line)] bg-white px-3 py-2"
      />
    </label>
  );
}

export function AssumptionsForm({ a }: { a: FinanceAssumptions }) {
  return (
    <form method="get" action="/finance" className="space-y-6 rounded-2xl border border-[var(--admin-line)] bg-[var(--admin-card)] p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          <span className="mb-1 block text-[var(--admin-muted)]">Horizon</span>
          <select name="horizon" defaultValue={a.horizonMonths} className="w-full rounded-xl border border-[var(--admin-line)] bg-white px-3 py-2">
            <option value="12">12 months</option>
            <option value="24">24 months</option>
            <option value="36">36 months</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-[var(--admin-muted)]">Scenario</span>
          <select name="scenario" defaultValue={a.scenario} className="w-full rounded-xl border border-[var(--admin-line)] bg-white px-3 py-2">
            <option value="conservative">Conservative</option>
            <option value="base">Base</option>
            <option value="optimistic">Optimistic</option>
          </select>
        </label>
        <div className="flex items-end">
          <button type="submit" className="rounded-full bg-[var(--admin-accent)] px-4 py-2 text-sm font-semibold text-[#fff8f4]">
            Recalculate projection
          </button>
        </div>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">Starting cohorts (planning inputs)</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field name="freeUsers" label="Free users" defaultValue={a.starting.freeUsers} />
          <Field name="plusMonthly" label="Plus monthly" defaultValue={a.starting.plusMonthly} />
          <Field name="plusAnnual" label="Plus annual" defaultValue={a.starting.plusAnnual} />
          <Field name="corporateMonthly" label="Corporate monthly" defaultValue={a.starting.corporateMonthly} />
          <Field name="corporateAnnual" label="Corporate annual" defaultValue={a.starting.corporateAnnual} />
          <Field name="unlimitedMonthly" label="Unlimited monthly" defaultValue={a.starting.unlimitedMonthly} />
          <Field name="unlimitedAnnual" label="Unlimited annual" defaultValue={a.starting.unlimitedAnnual} />
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">List prices (AUD, excl. GST)</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field name="pricePlusMonthly" label="Plus / month" defaultValue={a.pricing.plusMonthly} />
          <Field name="pricePlusAnnual" label="Plus / year" defaultValue={a.pricing.plusAnnual} />
          <Field name="priceEvent" label="Event booking" defaultValue={a.pricing.eventBooking} />
          <Field name="priceCorporateMonthly" label="Corporate / month" defaultValue={a.pricing.corporateMonthly} />
          <Field name="priceCorporateAnnual" label="Corporate / year" defaultValue={a.pricing.corporateAnnual} />
          <Field name="priceUnlimitedMonthly" label="Unlimited / month" defaultValue={a.pricing.unlimitedMonthly} />
          <Field name="priceUnlimitedAnnual" label="Unlimited / year" defaultValue={a.pricing.unlimitedAnnual} />
        </div>
        <p className="text-xs text-[var(--admin-muted)]">Free plan price is fixed at AUD 0.</p>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">Growth & conversion (monthly rates / counts)</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field name="freeOrganicGrowth" label="Free organic growth" defaultValue={a.growth.freeOrganicGrowth} step="0.001" />
          <Field name="freeAbsoluteAcquisitions" label="Free absolute adds" defaultValue={a.growth.freeAbsoluteAcquisitions} />
          <Field name="freeToPlusMonthlyConversion" label="Free→Plus monthly conv." defaultValue={a.growth.freeToPlusMonthlyConversion} step="0.001" />
          <Field name="freeToPlusAnnualConversion" label="Free→Plus annual conv." defaultValue={a.growth.freeToPlusAnnualConversion} step="0.001" />
          <Field name="corporateMonthlyAcquisitions" label="Corporate monthly adds" defaultValue={a.growth.corporateMonthlyAcquisitions} step="0.01" />
          <Field name="corporateAnnualAcquisitions" label="Corporate annual adds" defaultValue={a.growth.corporateAnnualAcquisitions} step="0.01" />
          <Field name="unlimitedMonthlyAcquisitions" label="Unlimited monthly adds" defaultValue={a.growth.unlimitedMonthlyAcquisitions} step="0.01" />
          <Field name="unlimitedAnnualAcquisitions" label="Unlimited annual adds" defaultValue={a.growth.unlimitedAnnualAcquisitions} step="0.01" />
          <Field name="eventBookingsMonth0" label="Event bookings (m0)" defaultValue={a.growth.eventBookingsMonth0} />
          <Field name="eventBookingGrowth" label="Event booking growth" defaultValue={a.growth.eventBookingGrowth} step="0.001" />
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">Churn (monthly fractions)</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field name="churnFree" label="Free" defaultValue={a.churn.free} step="0.001" />
          <Field name="churnPlusMonthly" label="Plus monthly" defaultValue={a.churn.plusMonthly} step="0.001" />
          <Field name="churnPlusAnnual" label="Plus annual" defaultValue={a.churn.plusAnnual} step="0.001" />
          <Field name="churnCorporateMonthly" label="Corporate monthly" defaultValue={a.churn.corporateMonthly} step="0.001" />
          <Field name="churnCorporateAnnual" label="Corporate annual" defaultValue={a.churn.corporateAnnual} step="0.001" />
          <Field name="churnUnlimitedMonthly" label="Unlimited monthly" defaultValue={a.churn.unlimitedMonthly} step="0.001" />
          <Field name="churnUnlimitedAnnual" label="Unlimited annual" defaultValue={a.churn.unlimitedAnnual} step="0.001" />
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">Operating expenses</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field name="azureFixed" label="Azure fixed / mo" defaultValue={a.opex.azureInfrastructureFixed} />
          <Field name="azurePerThousand" label="Azure / 1k users" defaultValue={a.opex.azurePerThousandUsers} />
          <Field name="aiPerSend" label="AI / send" defaultValue={a.opex.aiPerSend} step="0.001" />
          <Field name="sendsPerActiveUser" label="Sends / active user" defaultValue={a.opex.sendsPerActiveUser} step="0.01" />
          <Field name="emailPerSend" label="Email / send" defaultValue={a.opex.emailPerSend} step="0.0001" />
          <Field name="paymentProcessingRate" label="Payment processing rate" defaultValue={a.opex.paymentProcessingRate} step="0.001" />
          <Field name="otherFixed" label="Other fixed / mo" defaultValue={a.opex.otherFixedMonthly} />
        </div>
      </fieldset>
    </form>
  );
}
