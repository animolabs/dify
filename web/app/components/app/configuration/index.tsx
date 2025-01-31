'use client'
import type { FC } from 'react'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useContext } from 'use-context-selector'
import { usePathname } from 'next/navigation'
import produce from 'immer'
import { useBoolean } from 'ahooks'
import cn from 'classnames'
import Button from '../../base/button'
import Loading from '../../base/loading'
import type { CompletionParams, Inputs, ModelConfig, MoreLikeThisConfig, PromptConfig, PromptVariable } from '@/models/debug'
import type { DataSet } from '@/models/datasets'
import type { ModelConfig as BackendModelConfig } from '@/types/app'
import ConfigContext from '@/context/debug-configuration'
import ConfigModel from '@/app/components/app/configuration/config-model'
import Config from '@/app/components/app/configuration/config'
import Debug from '@/app/components/app/configuration/debug'
import Confirm from '@/app/components/base/confirm'
import { ProviderEnum } from '@/app/components/header/account-setting/model-page/declarations'
import { ToastContext } from '@/app/components/base/toast'
import { fetchAppDetail, updateAppModelConfig } from '@/service/apps'
import { promptVariablesToUserInputsForm, userInputsFormToPromptVariables } from '@/utils/model-config'
import { fetchDatasets } from '@/service/datasets'
import AccountSetting from '@/app/components/header/account-setting'
import { useProviderContext } from '@/context/provider-context'
import { AppType } from '@/types/app'

type PublichConfig = {
  modelConfig: ModelConfig
  completionParams: CompletionParams
}

const Configuration: FC = () => {
  const { t } = useTranslation()
  const { notify } = useContext(ToastContext)

  const [hasFetchedDetail, setHasFetchedDetail] = useState(false)
  const isLoading = !hasFetchedDetail
  const pathname = usePathname()
  const matched = pathname.match(/\/app\/([^/]+)/)
  const appId = (matched?.length && matched[1]) ? matched[1] : ''
  const [mode, setMode] = useState('')
  const [publishedConfig, setPublishedConfig] = useState<PublichConfig | null>(null)

  const [conversationId, setConversationId] = useState<string | null>('')
  const [introduction, setIntroduction] = useState<string>('')
  const [controlClearChatMessage, setControlClearChatMessage] = useState(0)
  const [prevPromptConfig, setPrevPromptConfig] = useState<PromptConfig>({
    prompt_template: '',
    prompt_variables: [],
  })
  const [moreLikeThisConfig, setMoreLikeThisConfig] = useState<MoreLikeThisConfig>({
    enabled: false,
  })
  const [suggestedQuestionsAfterAnswerConfig, setSuggestedQuestionsAfterAnswerConfig] = useState<MoreLikeThisConfig>({
    enabled: false,
  })
  const [speechToTextConfig, setSpeechToTextConfig] = useState<MoreLikeThisConfig>({
    enabled: false,
  })
  const [citationConfig, setCitationConfig] = useState<MoreLikeThisConfig>({
    enabled: false,
  })
  const [formattingChanged, setFormattingChanged] = useState(false)
  const [inputs, setInputs] = useState<Inputs>({})
  const [query, setQuery] = useState('')
  const [completionParams, setCompletionParams] = useState<CompletionParams>({
    max_tokens: 16,
    temperature: 1, // 0-2
    top_p: 1,
    presence_penalty: 1, // -2-2
    frequency_penalty: 1, // -2-2
  })
  const [modelConfig, doSetModelConfig] = useState<ModelConfig>({
    provider: ProviderEnum.openai,
    model_id: 'gpt-3.5-turbo',
    configs: {
      prompt_template: '',
      prompt_variables: [] as PromptVariable[],
    },
    opening_statement: '',
    more_like_this: null,
    suggested_questions_after_answer: null,
    speech_to_text: null,
    retriever_resource: null,
    dataSets: [],
  })

  const setModelConfig = (newModelConfig: ModelConfig) => {
    doSetModelConfig(newModelConfig)
  }

  const setModelId = (modelId: string, provider: ProviderEnum) => {
    const newModelConfig = produce(modelConfig, (draft: any) => {
      draft.provider = provider
      draft.model_id = modelId
    })
    setModelConfig(newModelConfig)
  }

  const [dataSets, setDataSets] = useState<DataSet[]>([])
  const contextVar = modelConfig.configs.prompt_variables.find(item => item.is_context_var)?.key
  const hasSetContextVar = !!contextVar
  const syncToPublishedConfig = (_publishedConfig: PublichConfig) => {
    const modelConfig = _publishedConfig.modelConfig
    setModelConfig(_publishedConfig.modelConfig)
    setCompletionParams(_publishedConfig.completionParams)
    setDataSets(modelConfig.dataSets || [])
    // feature
    setIntroduction(modelConfig.opening_statement!)
    setMoreLikeThisConfig(modelConfig.more_like_this || {
      enabled: false,
    })
    setSuggestedQuestionsAfterAnswerConfig(modelConfig.suggested_questions_after_answer || {
      enabled: false,
    })
    setSpeechToTextConfig(modelConfig.speech_to_text || {
      enabled: false,
    })
    setCitationConfig(modelConfig.retriever_resource || {
      enabled: false,
    })
  }

  const { textGenerationModelList } = useProviderContext()
  const hasSetCustomAPIKEY = !!textGenerationModelList?.find(({ model_provider: provider }) => {
    if (provider.provider_type === 'system' && provider.quota_type === 'paid')
      return true

    if (provider.provider_type === 'custom')
      return true

    return false
  })
  const isTrailFinished = !hasSetCustomAPIKEY && textGenerationModelList
    .filter(({ model_provider: provider }) => provider.quota_type === 'trial')
    .every(({ model_provider: provider }) => {
      const { quota_used, quota_limit } = provider
      return quota_used === quota_limit
    })

  const hasSetAPIKEY = hasSetCustomAPIKEY || !isTrailFinished

  const [isShowSetAPIKey, { setTrue: showSetAPIKey, setFalse: hideSetAPIkey }] = useBoolean()

  useEffect(() => {
    fetchAppDetail({ url: '/apps', id: appId }).then(async (res) => {
      setMode(res.mode)
      const modelConfig = res.model_config
      const model = res.model_config.model

      let datasets: any = null
      if (modelConfig.agent_mode?.enabled)
        datasets = modelConfig.agent_mode?.tools.filter(({ dataset }: any) => dataset?.enabled)

      if (dataSets && datasets?.length && datasets?.length > 0) {
        const { data: dataSetsWithDetail } = await fetchDatasets({ url: '/datasets', params: { page: 1, ids: datasets.map(({ dataset }: any) => dataset.id) } })
        datasets = dataSetsWithDetail
        setDataSets(datasets)
      }

      setIntroduction(modelConfig.opening_statement)
      if (modelConfig.more_like_this)
        setMoreLikeThisConfig(modelConfig.more_like_this)

      if (modelConfig.suggested_questions_after_answer)
        setSuggestedQuestionsAfterAnswerConfig(modelConfig.suggested_questions_after_answer)

      if (modelConfig.speech_to_text)
        setSpeechToTextConfig(modelConfig.speech_to_text)

      if (modelConfig.retriever_resource)
        setCitationConfig(modelConfig.retriever_resource)

      const config = {
        modelConfig: {
          provider: model.provider,
          model_id: model.name,
          configs: {
            prompt_template: modelConfig.pre_prompt,
            prompt_variables: userInputsFormToPromptVariables(modelConfig.user_input_form, modelConfig.dataset_query_variable),
          },
          opening_statement: modelConfig.opening_statement,
          more_like_this: modelConfig.more_like_this,
          suggested_questions_after_answer: modelConfig.suggested_questions_after_answer,
          speech_to_text: modelConfig.speech_to_text,
          retriever_resource: modelConfig.retriever_resource,
          dataSets: datasets || [],
        },
        completionParams: model.completion_params,
      }
      syncToPublishedConfig(config)
      setPublishedConfig(config)

      setHasFetchedDetail(true)
    })
  }, [appId])

  const promptEmpty = mode === AppType.completion && !modelConfig.configs.prompt_template
  const contextVarEmpty = mode === AppType.completion && dataSets.length > 0 && !hasSetContextVar
  const cannotPublish = promptEmpty || contextVarEmpty
  const saveAppConfig = async () => {
    const modelId = modelConfig.model_id
    const promptTemplate = modelConfig.configs.prompt_template
    const promptVariables = modelConfig.configs.prompt_variables

    if (promptEmpty) {
      notify({ type: 'error', message: t('appDebug.otherError.promptNoBeEmpty'), duration: 3000 })
      return
    }
    if (contextVarEmpty) {
      notify({ type: 'error', message: t('appDebug.feature.dataSet.queryVariable.contextVarNotEmpty'), duration: 3000 })
      return
    }
    const postDatasets = dataSets.map(({ id }) => ({
      dataset: {
        enabled: true,
        id,
      },
    }))

    // new model config data struct
    const data: BackendModelConfig = {
      pre_prompt: promptTemplate,
      user_input_form: promptVariablesToUserInputsForm(promptVariables),
      dataset_query_variable: contextVar || '',
      opening_statement: introduction || '',
      more_like_this: moreLikeThisConfig,
      suggested_questions_after_answer: suggestedQuestionsAfterAnswerConfig,
      speech_to_text: speechToTextConfig,
      retriever_resource: citationConfig,
      agent_mode: {
        enabled: true,
        tools: [...postDatasets],
      },
      model: {
        provider: modelConfig.provider,
        name: modelId,
        completion_params: completionParams as any,
      },
    }

    await updateAppModelConfig({ url: `/apps/${appId}/model-config`, body: data })
    const newModelConfig = produce(modelConfig, (draft: any) => {
      draft.opening_statement = introduction
      draft.more_like_this = moreLikeThisConfig
      draft.suggested_questions_after_answer = suggestedQuestionsAfterAnswerConfig
      draft.speech_to_text = speechToTextConfig
      draft.retriever_resource = citationConfig
      draft.dataSets = dataSets
    })
    setPublishedConfig({
      modelConfig: newModelConfig,
      completionParams,
    })
    notify({ type: 'success', message: t('common.api.success'), duration: 3000 })
  }

  const [showConfirm, setShowConfirm] = useState(false)
  const resetAppConfig = () => {
    syncToPublishedConfig(publishedConfig!)
    setShowConfirm(false)
  }

  const [showUseGPT4Confirm, setShowUseGPT4Confirm] = useState(false)
  const [showSetAPIKeyModal, setShowSetAPIKeyModal] = useState(false)

  if (isLoading) {
    return <div className='flex h-full items-center justify-center'>
      <Loading type='area' />
    </div>
  }

  return (
    <ConfigContext.Provider value={{
      appId,
      hasSetAPIKEY,
      isTrailFinished,
      mode,
      conversationId,
      introduction,
      setIntroduction,
      setConversationId,
      controlClearChatMessage,
      setControlClearChatMessage,
      prevPromptConfig,
      setPrevPromptConfig,
      moreLikeThisConfig,
      setMoreLikeThisConfig,
      suggestedQuestionsAfterAnswerConfig,
      setSuggestedQuestionsAfterAnswerConfig,
      speechToTextConfig,
      setSpeechToTextConfig,
      citationConfig,
      setCitationConfig,
      formattingChanged,
      setFormattingChanged,
      inputs,
      setInputs,
      query,
      setQuery,
      completionParams,
      setCompletionParams,
      modelConfig,
      setModelConfig,
      dataSets,
      setDataSets,
      hasSetContextVar,
    }}
    >
      <>
        <div className="flex flex-col h-full">
          <div className='flex items-center justify-between px-6 border-b shrink-0 h-14 boder-gray-100'>
            <div className='text-xl text-gray-900'>{t('appDebug.pageTitle')}</div>
            <div className='flex items-center'>
              {/* Model and Parameters */}
              <ConfigModel
                mode={mode}
                provider={modelConfig.provider as ProviderEnum}
                completionParams={completionParams}
                modelId={modelConfig.model_id}
                setModelId={setModelId}
                onCompletionParamsChange={(newParams: CompletionParams) => {
                  setCompletionParams(newParams)
                }}
                disabled={!hasSetAPIKEY}
              />
              <div className='mx-3 w-[1px] h-[14px] bg-gray-200'></div>
              <Button onClick={() => setShowConfirm(true)} className='shrink-0 mr-2 w-[70px] !h-8 !text-[13px] font-medium'>{t('appDebug.operation.resetConfig')}</Button>
              <Button type='primary' onClick={saveAppConfig} className={cn(cannotPublish && '!bg-primary-200 !cursor-not-allowed', 'shrink-0 w-[70px] !h-8 !text-[13px] font-medium')}>{t('appDebug.operation.applyConfig')}</Button>
            </div>
          </div>
          <div className='flex grow h-[200px]'>
            <div className="w-[574px] shrink-0 h-full overflow-y-auto border-r border-gray-100 py-4 px-6">
              <Config />
            </div>
            <div className="relative grow h-full overflow-y-auto  py-4 px-6 bg-gray-50 flex flex-col">
              <Debug hasSetAPIKEY={hasSetAPIKEY} onSetting={showSetAPIKey} />
            </div>
          </div>
        </div>
        {showConfirm && (
          <Confirm
            title={t('appDebug.resetConfig.title')}
            content={t('appDebug.resetConfig.message')}
            isShow={showConfirm}
            onClose={() => setShowConfirm(false)}
            onConfirm={resetAppConfig}
            onCancel={() => setShowConfirm(false)}
          />
        )}
        {showUseGPT4Confirm && (
          <Confirm
            title={t('appDebug.trailUseGPT4Info.title')}
            content={t('appDebug.trailUseGPT4Info.description')}
            isShow={showUseGPT4Confirm}
            onClose={() => setShowUseGPT4Confirm(false)}
            onConfirm={() => {
              setShowSetAPIKeyModal(true)
              setShowUseGPT4Confirm(false)
            }}
            onCancel={() => setShowUseGPT4Confirm(false)}
          />
        )}
        {
          showSetAPIKeyModal && (
            <AccountSetting activeTab="provider" onCancel={async () => {
              setShowSetAPIKeyModal(false)
            }} />
          )
        }
        {isShowSetAPIKey && <AccountSetting activeTab="provider" onCancel={async () => {
          hideSetAPIkey()
        }} />}
      </>
    </ConfigContext.Provider>
  )
}
export default React.memo(Configuration)
