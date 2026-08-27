interface Step {
  label: string
  sublabel?: string
}

interface Props {
  steps: Step[]
  currentStep: number  // 0-indexed
}

export default function StepWizard({ steps, currentStep }: Props) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 0,
      padding: '0 0 32px',
      userSelect: 'none' as const,
    }}>
      {steps.map((step, i) => {
        const done = i < currentStep
        const active = i === currentStep
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.85rem',
                fontWeight: 700,
                background: done ? '#16a34a' : active ? '#2563eb' : '#e5e7eb',
                color: done || active ? '#fff' : '#9ca3af',
                transition: 'all 0.2s',
              }}>
                {done ? '✓' : i + 1}
              </div>
              <div style={{ textAlign: 'center' as const }}>
                <div style={{
                  fontSize: '0.78rem',
                  fontWeight: active ? 700 : 500,
                  color: active ? '#1d4ed8' : done ? '#15803d' : '#6b7280',
                }}>
                  {step.label}
                </div>
                {step.sublabel && (
                  <div style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: 1 }}>
                    {step.sublabel}
                  </div>
                )}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div style={{
                width: 64,
                height: 2,
                background: i < currentStep ? '#16a34a' : '#e5e7eb',
                margin: '0 8px',
                marginBottom: 24,
                transition: 'background 0.2s',
              }} />
            )}
          </div>
        )
      })}
    </div>
  )
}
