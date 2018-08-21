##히스토그램은 연속된 특징의 전체적인 분포를 정확하게 나타내준다.
import pandas as pd
import plotly.offline as pyo
import plotly.graph_objs as go

df = pd.read_csv('mpg.csv')

data = [go.Histogram(x=df['mpg'],
                    xbins=dict(start=0, end=50, size=2))]  ##xbins를 조정해줌으로서 확실히 다르게 그래프가 보일 것이다.
                                                            ##xbins는 박스의 시작과 끝, size를 지정해줄 수 있다.

layout = go.Layout(title='Histogram')
fig = go.Figure(data=data, layout=layout)
pyo.plot(fig)
