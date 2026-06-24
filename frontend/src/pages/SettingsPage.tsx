import { useEffect } from 'react'
import { useSettingsStore } from '@/store/settingsStore'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import AgentSkillsSection from '@/components/settings/AgentSkillsSection'
import McpServersSection from '@/components/settings/McpServersSection'
import LlmProvidersSection from '@/components/settings/LlmProvidersSection'

const TOKEN = 'dev-token'

export default function SettingsPage() {
  const { fetchMcpServers, fetchLlmProviders } = useSettingsStore()

  useEffect(() => {
    fetchMcpServers(TOKEN)
    fetchLlmProviders(TOKEN)
  }, [])

  return (
    <div className="flex flex-col h-full p-4">
      <h1 className="text-lg font-bold mb-4">Settings</h1>

      <Accordion multiple className="space-y-2">
        <AccordionItem value="skills" className="border border-border rounded-lg px-3">
          <AccordionTrigger className="text-sm py-2">Agent Skills</AccordionTrigger>
          <AccordionContent className="pb-3">
            <AgentSkillsSection />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="mcp" className="border border-border rounded-lg px-3">
          <AccordionTrigger className="text-sm py-2">MCP Servers</AccordionTrigger>
          <AccordionContent className="pb-3">
            <McpServersSection />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="llm" className="border border-border rounded-lg px-3">
          <AccordionTrigger className="text-sm py-2">LLM Providers</AccordionTrigger>
          <AccordionContent className="pb-3">
            <LlmProvidersSection />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
