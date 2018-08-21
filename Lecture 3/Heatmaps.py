##Heats map은 연속된 세변수를 나타내어 준다.
##예시 일주일간 시간별 온도 데이터 표시.
import plotly.offline as pyo
import plotly.graph_objs as go
from plotly import tools
import pandas as pd

df0 = pd.read_csv('2010SitkaAK.csv')
df1 = pd.read_csv('2010SantaBarbaraCA.csv')
df2 = pd.read_csv('2010YumaAZ.csv')

trace0 = go.Heatmap(x=df0['DAY'],
                    y=df0['LST_TIME'],
                    z=df0['T_HR_AVG'],
                    colorscale='Jet',
                    zmin=5,zmax=40)
trace1 = go.Heatmap(x=df1['DAY'],
                    y=df1['LST_TIME'],
                    z=df1['T_HR_AVG'],
                    colorscale='Jet',
                    zmin=5,zmax=40)
trace2= go.Heatmap(x=df2['DAY'],
                    y=df2['LST_TIME'],
                    z=df2['T_HR_AVG'],
                    colorscale='Jet',
                    zmin=5,zmax=40)

fig = tools.make_subplots(rows=1, cols=3,
                            subplot_titles=['SIka AK', 'SB CA', 'Yuma AZ'],
                            shared_yaxes=True) #shared_yaxes means that y_axis will be shared.
fig.append_trace(trace0,1,1)
fig.append_trace(trace1,1,2)
fig.append_trace(trace2,1,3)

fig['layout'].update(title='Tems for 3cities')

pyo.plot(fig)
